-- ==============================================================================
-- FASE: PERBAIKAN CRUD LAYER
-- Migration: 20260913000001_crud_fixes.sql
--
-- Perubahan:
-- 1. Sequence untuk personnel_code (menggantikan retry loop 50x di server)
-- 2. Unique index pada awards (personnel_id, title, category) untuk upsert
-- 3. Kolom proof_object_path pada awards (diquery oleh server tapi belum ada)
-- 4. Tabel audit api.personnel_audit + trigger
-- 5. Backfill term_start/term_end dari term_raw
-- 6. Fungsi RPC untuk atomic awards save
-- ==============================================================================

-- 1. Sequence untuk auto-generate personnel_code
-- Dimulai dari MAX existing + 1 agar tidak bentrok
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX((regexp_match(personnel_code, 'PRS-(\d+)'))[1]::integer), 0)
    INTO max_num
    FROM api.personnel;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS api.personnel_code_seq START WITH %s', max_num + 1);
END $$;

-- Default kolom personnel_code menggunakan sequence
-- CATATAN: Hanya berlaku untuk INSERT yang TIDAK mengirim personnel_code
ALTER TABLE api.personnel
  ALTER COLUMN personnel_code
  SET DEFAULT 'PRS-' || lpad(nextval('api.personnel_code_seq')::text, 4, '0');

-- 2. Bersihkan baris duplikat yang terakumulasi akibat bug B7 sebelum membuat unique index
DELETE FROM api.awards
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY personnel_id, title, COALESCE(category, '')
      ORDER BY created_at DESC, id
    ) as rnum
    FROM api.awards
  ) t
  WHERE t.rnum > 1
);

-- Unique index pada awards untuk mendukung upsert dengan onConflict
-- Menggunakan ekspresi (COALESCE(category, '')) dalam tanda kurung untuk PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS idx_awards_natural_key
  ON api.awards (personnel_id, title, (COALESCE(category, '')));

-- 3. Tambahkan kolom proof_object_path pada awards (diquery server.js tapi belum ada di skema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'api' AND table_name = 'awards' AND column_name = 'proof_object_path'
  ) THEN
    ALTER TABLE api.awards ADD COLUMN proof_object_path text;
  END IF;
END $$;

-- 4. Tabel audit untuk tracing mutasi
CREATE TABLE IF NOT EXISTS api.personnel_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  personnel_id uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_fields jsonb,
  old_values   jsonb,
  new_values   jsonb,
  version_before integer,
  version_after  integer,
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by text  -- bisa diisi dari request header / token hash
);

CREATE INDEX IF NOT EXISTS idx_audit_personnel_id ON api.personnel_audit(personnel_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON api.personnel_audit(performed_at);

-- Trigger audit otomatis pada personnel
CREATE OR REPLACE FUNCTION api.audit_personnel()
RETURNS trigger AS $$
DECLARE
  changed jsonb := '[]'::jsonb;
  old_vals jsonb;
  new_vals jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_vals := to_jsonb(OLD);
    new_vals := to_jsonb(NEW);
    -- Hitung field yang berubah
    SELECT jsonb_agg(key) INTO changed
    FROM jsonb_each_text(new_vals) n
    WHERE n.key NOT IN ('updated_at', 'version')
      AND n.value IS DISTINCT FROM (old_vals ->> n.key);

    IF changed IS NOT NULL AND jsonb_array_length(changed) > 0 THEN
      INSERT INTO api.personnel_audit
        (personnel_id, action, changed_fields, old_values, new_values, version_before, version_after)
      VALUES
        (NEW.id, 'UPDATE', changed, old_vals, new_vals, OLD.version, NEW.version);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO api.personnel_audit
      (personnel_id, action, new_values, version_after)
    VALUES
      (NEW.id, 'INSERT', to_jsonb(NEW), NEW.version);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personnel_audit ON api.personnel;
CREATE TRIGGER trg_personnel_audit
  AFTER INSERT OR UPDATE ON api.personnel
  FOR EACH ROW EXECUTE FUNCTION api.audit_personnel();

-- 5. Backfill term_start/term_end dari term_raw
-- Format yang dikenal: "2023-2028", "2023 - 2028", "Maret 2023 - Maret 2028"
-- Hanya isi jika term_start/term_end masih NULL dan term_raw ada
UPDATE api.personnel
SET
  term_start = CASE
    WHEN term_raw ~ '^\d{4}\s*[-–]\s*\d{4}$'
    THEN make_date(substring(term_raw from '^\d{4}')::integer, 1, 1)
    ELSE term_start
  END,
  term_end = CASE
    WHEN term_raw ~ '^\d{4}\s*[-–]\s*\d{4}$'
    THEN make_date(substring(term_raw from '\d{4}$')::integer, 12, 31)
    ELSE term_end
  END
WHERE term_raw IS NOT NULL
  AND term_raw != ''
  AND (term_start IS NULL OR term_end IS NULL);

-- 6. Fungsi RPC untuk atomic awards save (delete + insert dalam satu transaksi)
CREATE OR REPLACE FUNCTION api.save_awards_atomic(
  p_personnel_id uuid,
  p_awards jsonb
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  award_record jsonb;
  inserted_count integer := 0;
BEGIN
  -- Hapus awards lama milik personel ini
  DELETE FROM api.awards WHERE personnel_id = p_personnel_id;

  -- Insert awards baru
  FOR award_record IN SELECT * FROM jsonb_array_elements(p_awards)
  LOOP
    INSERT INTO api.awards (personnel_id, title, category, issuer, proof_local_path, proof_object_path, is_published)
    VALUES (
      p_personnel_id,
      award_record->>'title',
      NULLIF(award_record->>'category', ''),
      NULLIF(award_record->>'issuer', ''),
      NULLIF(award_record->>'proof_local_path', ''),
      NULLIF(award_record->>'proof_object_path', ''),
      COALESCE((award_record->>'is_published')::boolean, false)
    )
    ON CONFLICT (personnel_id, title, (COALESCE(category, '')))
    DO UPDATE SET
      issuer = EXCLUDED.issuer,
      proof_local_path = EXCLUDED.proof_local_path,
      proof_object_path = EXCLUDED.proof_object_path,
      is_published = EXCLUDED.is_published;
    inserted_count := inserted_count + 1;
  END LOOP;

  result := jsonb_build_object('ok', true, 'count', inserted_count);
  RETURN result;
END;
$$ LANGUAGE plpgsql;
