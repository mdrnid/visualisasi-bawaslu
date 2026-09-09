-- ==============================================================================
-- FASE 1: SKEMA DATABASE SUPABASE (Schema api)
-- Migration: 20260910000001_initial_schema.sql
-- ==============================================================================

create schema if not exists api;
create extension if not exists pg_trgm;

-- 1. Tabel api.personnel
create table if not exists api.personnel (
  id                 uuid primary key default gen_random_uuid(),
  personnel_code     text unique not null,
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
  photo_local_path   text,     -- path file lama di disk lokal
  photo_object_path  text,     -- path objek di bucket public-photos (diisi Fase 5)
  photo_is_public    boolean not null default false,
  is_published       boolean not null default false,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- 2. Tabel api.awards
create table if not exists api.awards (
  id               uuid primary key default gen_random_uuid(),
  personnel_id     uuid not null references api.personnel(id) on delete cascade,
  title            text not null,
  category         text,
  issuer           text,
  awarded_on       date,
  proof_local_path text,        -- berkas bukti tetap di disk lokal
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 3. Fungsi & Trigger set_updated_at()
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

-- 4. Trigger bump_version() untuk api.personnel
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

-- 5. Indeks Kinerja & Pencarian
create index if not exists idx_personnel_province on api.personnel(province);
create index if not exists idx_personnel_district on api.personnel(district);
create index if not exists idx_personnel_division on api.personnel(division);
create index if not exists idx_personnel_is_published on api.personnel(is_published);
create index if not exists idx_personnel_deleted_at on api.personnel(deleted_at);
create index if not exists idx_personnel_name_trgm on api.personnel using gin (name gin_trgm_ops);

create index if not exists idx_awards_personnel_id on api.awards(personnel_id);
create index if not exists idx_awards_is_published on api.awards(is_published);

-- 6. DUA VIEW Proyeksi Publik (Security Invoker)
-- Satu-satunya pintu untuk situs publik, memfilter baris aktif dan membatasi kolom PII.
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
