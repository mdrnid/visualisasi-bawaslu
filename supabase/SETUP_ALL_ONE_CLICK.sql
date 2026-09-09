-- ==============================================================================
-- SETUP ALL ONE CLICK: PROYEK DIREKTORI PERSONEL BAWASLU
-- Eksekusi file ini sekali di Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. EXTENSION & SCHEMA
create schema if not exists api;
create extension if not exists pg_trgm;

-- 2. TABEL api.personnel
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
  photo_local_path   text,
  photo_object_path  text,
  photo_is_public    boolean not null default false,
  is_published       boolean not null default false,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- 3. TABEL api.awards
create table if not exists api.awards (
  id               uuid primary key default gen_random_uuid(),
  personnel_id     uuid not null references api.personnel(id) on delete cascade,
  title            text not null,
  category         text,
  issuer           text,
  awarded_on       date,
  proof_local_path text,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 4. TRIGGER updated_at
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

-- 5. TRIGGER bump_version
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

-- 6. INDEKS
create index if not exists idx_personnel_province on api.personnel(province);
create index if not exists idx_personnel_district on api.personnel(district);
create index if not exists idx_personnel_division on api.personnel(division);
create index if not exists idx_personnel_is_published on api.personnel(is_published);
create index if not exists idx_personnel_deleted_at on api.personnel(deleted_at);
create index if not exists idx_personnel_name_trgm on api.personnel using gin (name gin_trgm_ops);
create index if not exists idx_awards_personnel_id on api.awards(personnel_id);
create index if not exists idx_awards_is_published on api.awards(is_published);

-- 7. VIEW PROYEKSI PUBLIK (security_invoker = true)
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

-- 8. ROW LEVEL SECURITY (RLS) & GRANTS (anon)
alter table api.personnel enable row level security;
alter table api.awards    enable row level security;

revoke all on all tables in schema api from anon, authenticated;
grant usage on schema api to anon;

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

-- 9. STORAGE BUCKET public-photos
insert into storage.buckets (id, name, public)
values ('public-photos', 'public-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Read Access for Public Photos" on storage.objects;
create policy "Public Read Access for Public Photos"
  on storage.objects for select
  using (bucket_id = 'public-photos');
