-- ==============================================================================
-- FASE 5: STORAGE BUCKET FOTO PUBLIK
-- Migration: 20260910000003_storage_setup.sql
--
-- Bucket public-photos hanya untuk foto profil yang dipublikasikan (photo_is_public = true).
-- Dilarang membuat bucket untuk dokumen bukti. Dokumen bukti tetap di disk lokal.
-- ==============================================================================

-- 1. Buat bucket public-photos bila belum ada
insert into storage.buckets (id, name, public)
values ('public-photos', 'public-photos', true)
on conflict (id) do update set public = true;

-- 2. Kebijakan publik read untuk bucket public-photos
drop policy if exists "Public Read Access for Public Photos" on storage.objects;
create policy "Public Read Access for Public Photos"
  on storage.objects for select
  using (bucket_id = 'public-photos');

-- Catatan: Operasi Upload/Delete dijalankan oleh server.js / scripts menggunakan
-- SERVICE_ROLE_KEY, sehingga tidak memerlukan policy INSERT/UPDATE/DELETE untuk publik/anon.
