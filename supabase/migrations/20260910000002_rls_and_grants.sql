-- ==============================================================================
-- FASE 2: ROW LEVEL SECURITY & COLUMN-LEVEL GRANTS (Hanya untuk anon)
-- Migration: 20260910000002_rls_and_grants.sql
--
-- CATATAN KEAMANAN (3 Lapis Pertahanan):
-- 1. VIEW publik (api.personnel_public, api.awards_public) membatasi kolom yang diekspos.
-- 2. Column-level GRANT memastikan tabel utama tidak bisa di-SELECT sembarang kolom oleh anon.
-- 3. RLS membatasi baris: hanya record dengan is_published = true dan deleted_at IS NULL.
--
-- Akses Admin (Aplikasi Admin Lokal) berjalan di server.js menggunakan
-- SERVICE_ROLE_KEY dari .env, yang secara otomatis bypass RLS.
-- ==============================================================================

-- 1. Aktifkan RLS pada kedua tabel utama
alter table api.personnel enable row level security;
alter table api.awards    enable row level security;

-- 2. Bersihkan hak akses default
revoke all on all tables in schema api from anon, authenticated;
grant usage on schema api to anon;

-- 3. Column-level SELECT grant untuk anon (TIDAK mencakup PII seperti phone, email pribadi, alamat, foto lokal)
grant select (id, personnel_code, province, district, name, gender, position, wakordiv, division,
              term_end, office_email, website, photo_object_path, photo_is_public,
              is_published, deleted_at, updated_at)
  on api.personnel to anon;

grant select (id, personnel_id, title, category, issuer, awarded_on, is_published, updated_at)
  on api.awards to anon;

-- 4. Grant SELECT pada view proyeksi publik
grant select on api.personnel_public, api.awards_public to anon;

-- 5. Kebijakan RLS (Hanya membaca baris publik aktif)
drop policy if exists "anon reads published personnel" on api.personnel;
create policy "anon reads published personnel" on api.personnel
  for select to anon using (is_published and deleted_at is null);

drop policy if exists "anon reads published awards" on api.awards;
create policy "anon reads published awards" on api.awards
  for select to anon using (
    is_published and exists (
      select 1 from api.personnel p
       where p.id = personnel_id and p.is_published and p.deleted_at is null));
