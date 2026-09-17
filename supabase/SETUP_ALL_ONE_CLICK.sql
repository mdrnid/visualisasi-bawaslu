-- ==============================================================================
-- SETUP ALL ONE CLICK: PROYEK DIREKTORI PERSONEL BAWASLU (BIPAL)
-- Eksekusi file ini sekali di Supabase Dashboard -> SQL Editor (New Query -> Run)
-- ==============================================================================

-- 1. EXTENSION & SCHEMA
create schema if not exists api;
create extension if not exists pg_trgm;

-- 2. SEQUENCE UNTUK AUTO-GENERATE PERSONNEL_CODE (PRS-0001 dst)
create sequence if not exists api.personnel_code_seq start with 1;

-- 3. TABEL api.personnel
create table if not exists api.personnel (
  id                 uuid primary key default gen_random_uuid(),
  personnel_code     text unique not null default ('PRS-' || lpad(nextval('api.personnel_code_seq')::text, 4, '0')),
  province           text,
  district           text,
  name               text not null,
  gender             text check (gender in ('L', 'P')),
  position           text,
  wakordiv           text,
  division           text,
  term_start         date,
  term_end           date,
  term_raw           text,
  religion           text,
  education          text,
  phone              text,
  private_email      text,
  office_email       text,
  office_address     text,
  facebook           text,
  instagram          text,
  website            text,
  photo_local_path   text,
  photo_object_path  text,
  photo_is_public    boolean not null default false,
  is_published       boolean not null default false,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- 4. TABEL api.awards
create table if not exists api.awards (
  id                uuid primary key default gen_random_uuid(),
  personnel_id      uuid not null references api.personnel(id) on delete cascade,
  title             text not null,
  category          text,
  issuer            text,
  awarded_on        date,
  proof_local_path  text,
  proof_object_path text,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Unique index pada awards untuk mendukung atomic upsert
create unique index if not exists idx_awards_natural_key
  on api.awards (personnel_id, title, (coalesce(category, '')));

-- 5. TABEL api.personnel_audit (Pencatatan Audit Trail)
create table if not exists api.personnel_audit (
  id             bigint generated always as identity primary key,
  personnel_id   uuid not null,
  action         text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_fields jsonb,
  old_values     jsonb,
  new_values     jsonb,
  version_before integer,
  version_after  integer,
  performed_at   timestamptz not null default now(),
  performed_by   text
);

create index if not exists idx_audit_personnel_id on api.personnel_audit(personnel_id);
create index if not exists idx_audit_performed_at on api.personnel_audit(performed_at);

-- 6. TRIGGERS (updated_at, bump_version, audit)
create or replace function api.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_personnel_updated_at on api.personnel;
create trigger trg_personnel_updated_at
  before update on api.personnel
  for each row execute function api.set_updated_at();

drop trigger if exists trg_awards_updated_at on api.awards;
create trigger trg_awards_updated_at
  before update on api.awards
  for each row execute function api.set_updated_at();

-- Trigger bump_version (Optimistic Locking)
create or replace function api.bump_version()
returns trigger as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_personnel_bump_version on api.personnel;
create trigger trg_personnel_bump_version
  before update on api.personnel
  for each row execute function api.bump_version();

-- Trigger audit log
create or replace function api.audit_personnel()
returns trigger as $$
declare
  changed jsonb := '[]'::jsonb;
  old_vals jsonb;
  new_vals jsonb;
begin
  if TG_OP = 'UPDATE' then
    old_vals := to_jsonb(OLD);
    new_vals := to_jsonb(NEW);
    select jsonb_agg(key) into changed
    from jsonb_each_text(new_vals) n
    where n.key not in ('updated_at', 'version')
      and n.value is distinct from (old_vals ->> n.key);

    if changed is not null and jsonb_array_length(changed) > 0 then
      insert into api.personnel_audit
        (personnel_id, action, changed_fields, old_values, new_values, version_before, version_after)
      values
        (NEW.id, 'UPDATE', changed, old_vals, new_vals, OLD.version, NEW.version);
    end if;
  elsif TG_OP = 'INSERT' then
    insert into api.personnel_audit
      (personnel_id, action, new_values, version_after)
    values
      (NEW.id, 'INSERT', to_jsonb(NEW), NEW.version);
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_personnel_audit on api.personnel;
create trigger trg_personnel_audit
  after insert or update on api.personnel
  for each row execute function api.audit_personnel();

-- 7. INDEKS PERFORMA
create index if not exists idx_personnel_province on api.personnel(province);
create index if not exists idx_personnel_district on api.personnel(district);
create index if not exists idx_personnel_division on api.personnel(division);
create index if not exists idx_personnel_is_published on api.personnel(is_published);
create index if not exists idx_personnel_deleted_at on api.personnel(deleted_at);
create index if not exists idx_personnel_name_trgm on api.personnel using gin (name gin_trgm_ops);
create index if not exists idx_awards_personnel_id on api.awards(personnel_id);
create index if not exists idx_awards_is_published on api.awards(is_published);

-- 8. VIEW PROYEKSI PUBLIK (security_invoker = true)
drop view if exists api.personnel_public;
create view api.personnel_public with (security_invoker = true) as
  select id, personnel_code, province, district, name, gender, position, wakordiv, division,
         term_end, office_email, website,
         case when photo_is_public then photo_object_path end as photo_path,
         updated_at
    from api.personnel
   where is_published and deleted_at is null;

drop view if exists api.awards_public;
create view api.awards_public with (security_invoker = true) as
  select a.id, a.personnel_id, a.title, a.category, a.issuer, a.awarded_on, a.updated_at
    from api.awards a
    join api.personnel p on p.id = a.personnel_id
   where a.is_published and p.is_published and p.deleted_at is null;

-- 9. RPC FUNCTION: save_awards_atomic
create or replace function api.save_awards_atomic(
  p_personnel_id uuid,
  p_awards jsonb
)
returns jsonb as $$
declare
  result jsonb;
  award_record jsonb;
  inserted_count integer := 0;
begin
  delete from api.awards where personnel_id = p_personnel_id;

  for award_record in select * from jsonb_array_elements(p_awards)
  loop
    insert into api.awards (personnel_id, title, category, issuer, proof_local_path, proof_object_path, is_published)
    values (
      p_personnel_id,
      award_record->>'title',
      nullif(award_record->>'category', ''),
      nullif(award_record->>'issuer', ''),
      nullif(award_record->>'proof_local_path', ''),
      nullif(award_record->>'proof_object_path', ''),
      coalesce((award_record->>'is_published')::boolean, false)
    )
    on conflict (personnel_id, title, (coalesce(category, '')))
    do update set
      issuer = excluded.issuer,
      proof_local_path = excluded.proof_local_path,
      proof_object_path = excluded.proof_object_path,
      is_published = excluded.is_published;
    inserted_count := inserted_count + 1;
  end loop;

  result := jsonb_build_object('ok', true, 'count', inserted_count);
  return result;
end;
$$ language plpgsql;

-- 10. ROW LEVEL SECURITY (RLS) & GRANTS
alter table api.personnel       enable row level security;
alter table api.awards          enable row level security;
alter table api.personnel_audit enable row level security;

revoke all on all tables in schema api from anon, authenticated;
grant usage on schema api to anon, authenticated, service_role, postgres;
grant usage on schema api to authenticator;
grant all privileges on all tables in schema api to service_role, postgres;
grant all privileges on all sequences in schema api to service_role, postgres;
grant all privileges on all routines in schema api to service_role, postgres;
alter default privileges in schema api grant all on tables to service_role, postgres;
alter default privileges in schema api grant all on sequences to service_role, postgres;

grant select (id, personnel_code, province, district, name, gender, position, wakordiv, division,
              term_end, office_email, website, photo_object_path, photo_is_public,
              is_published, deleted_at, updated_at)
  on api.personnel to anon;

grant select (id, personnel_id, title, category, issuer, awarded_on, is_published, updated_at)
  on api.awards to anon;

grant select on api.personnel_public, api.awards_public to anon;

drop policy if exists "anon reads published personnel" on api.personnel;
create policy "anon reads published personnel" on api.personnel
  for select to anon using (is_published and deleted_at is null);

drop policy if exists "anon reads published awards" on api.awards;
create policy "anon reads published awards" on api.awards
  for select to anon using (
    is_published and exists (
      select 1 from api.personnel p
       where p.id = personnel_id and p.is_published and p.deleted_at is null));

-- 11. STORAGE BUCKETS (public-photos & award-proofs)
insert into storage.buckets (id, name, public)
values ('public-photos', 'public-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('award-proofs', 'award-proofs', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Read Access for Public Photos" on storage.objects;
create policy "Public Read Access for Public Photos"
  on storage.objects for select
  using (bucket_id = 'public-photos');

drop policy if exists "Public Read Access for Award Proofs" on storage.objects;
create policy "Public Read Access for Award Proofs"
  on storage.objects for select
  using (bucket_id = 'award-proofs');

-- Selesai!
