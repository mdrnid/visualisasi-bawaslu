# Kontrak Data Publik (Public Data Contract)

Dokumen ini adalah spesifikasi resmi (**Kontrak Data Publik**) yang menjadi satu-satunya gerbang bagi situs web publik (misalnya Web Publik Direktori Bawaslu / Project B) untuk mengakses data personel dan penghargaan melalui Supabase Data API.

---

## 1. Prinsip Keamanan & Privasi

1. **Schema Terisolasi:**
   Situs publik **HANYA** mengakses schema `api` melalui view proyeksi publik:
   - `api.personnel_public`
   - `api.awards_public`
2. **Kunci Akses Publik:**
   Menggunakan `SUPABASE_ANON_KEY` dengan hak akses `SELECT` yang dibatasi oleh Row Level Security (RLS) dan Column-Level Grant.
3. **Kerahasiaan PII:**
   Tabel utama `api.personnel` dan `api.awards` tertutup bagi `anon` untuk operasi `INSERT`, `UPDATE`, dan `DELETE`. Kolom PII sensitif diblokir di tingkat skema, view, dan grant.

---

## 2. Definisi View Proyeksi Publik

### A. View `api.personnel_public`

View ini hanya mengembalikan baris yang memenuhi kriteria:
`where is_published = true and deleted_at is null`

| Nama Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary key unik internal |
| `personnel_code` | `text` | Kode unik personel publik (`PRS-xxxx`) |
| `province` | `text` | Nama provinsi |
| `district` | `text` | Nama kabupaten / kota |
| `name` | `text` | Nama lengkap dan gelar personel |
| `gender` | `text` | Jenis kelamin (`'L'` atau `'P'`) |
| `position` | `text` | Jabatan struktural (misal: Ketua, Anggota) |
| `wakordiv` | `text` | Wakil koordinator divisi |
| `division` | `text` | Nama divisi tugas |
| `term_end` | `date` | Akhir masa jabatan |
| `office_email` | `text` | Email kantor resmi |
| `website` | `text` | Tautan website resmi |
| `photo_path` | `text` | Path objek foto di bucket `public-photos` (hanya jika `photo_is_public = true`) |
| `updated_at` | `timestamptz` | Timestamp pembaruan data terakhir |

> [!CAUTION]
> **KOLOM YANG HARAM DIPUBLIKASIKAN (DILARANG MUNCUL DI VIEW PUBLIK):**
> - `phone` (Nomor HP / WhatsApp)
> - `private_email` (E-mail pribadi)
> - `religion` (Agama)
> - `education` (Pendidikan)
> - `office_address` (Alamat rumah/kantor)
> - `photo_local_path` (Path berkas lokal lama)
> - `proof_local_path` (Path berkas dokumen bukti)

---

### B. View `api.awards_public`

View ini hanya mengembalikan penghargaan milik personel yang dipublikasikan:
`where a.is_published = true and p.is_published = true and p.deleted_at is null`

| Nama Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `id` | `uuid` | ID unik penghargaan |
| `personnel_id` | `uuid` | Foreign key mengacu ke `api.personnel(id)` |
| `title` | `text` | Judul / nama penghargaan atau peran kegiatan |
| `category` | `text` | Kategori penghargaan (Prestasi, Narasumber, Fasilitator, dll) |
| `issuer` | `text` | Lembaga / instansi pemberi |
| `awarded_on` | `date` | Tanggal penganugerahan (bila ada) |
| `updated_at` | `timestamptz` | Timestamp pembaruan data |

---

## 3. Konvensi Storage Foto Publik

- **Nama Bucket:** `public-photos`
- **Tipe Akses:** Public Read (hanya membaca file lewat URL publik).
- **Konvensi Path:**
  `personnel/<uuid>/profile.<ext>`
  Contoh: `personnel/3fa85f64-5717-4562-b3fc-2c963f66afa6/profile.webp`
- **Aturan Penarikan Foto:**
  Bila `photo_is_public` diubah menjadi `false`, atau `is_published` menjadi `false`, atau record di-*soft delete*, script sinkronisasi (`scripts/sync-public-photos.mjs`) akan otomatis menghapus objek dari bucket dan mengosongkan kolom `photo_object_path`.
- **Dokumen Bukti:** Tidak pernah diunggah ke storage publik dan tidak memiliki bucket.

---

## 4. Contoh Query Klien Publik (Menggunakan Anon Key)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xyzcompany.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // anon key
  { db: { schema: 'api' } }
);

// 1. Mengambil daftar personel publik
const { data: personnel, error } = await supabase
  .from('personnel_public')
  .select('id, personnel_code, district, name, position, photo_path')
  .order('district', { ascending: true });

// 2. Mengambil URL publik foto profil
const { data: { publicUrl } } = supabase
  .storage
  .from('public-photos')
  .getPublicUrl(personnel[0].photo_path);

// 3. Mengambil penghargaan personel
const { data: awards } = await supabase
  .from('awards_public')
  .select('title, category, issuer, awarded_on')
  .eq('personnel_id', personnel[0].id);
```
