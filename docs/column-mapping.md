# Pemetaan Kolom Data (Excel & JSON -> Supabase Postgres)

Dokumen ini memetakan setiap kolom dari sumber data lama (`data/data.xlsx` dan `data/penghargaan.json`) ke skema database Postgres di schema `api` Supabase.

---

## 1. Tabel Utama: `api.personnel`

Sumber data utama: `data/data.xlsx` (Sheet: `DATA`, 87 baris data aktual).

| Header Excel Asli | Kolom Database (`api.personnel`) | Tipe Data Postgres | Nullable | Contoh Nilai Asli | Aturan Normalisasi / Transformasi | Catatan & Kompatibilitas Frontend |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(Dihasilkan sistem)* | `id` | `uuid` | NOT NULL (PK) | `gen_random_uuid()` | Default UUID v4 | Primary Key internal permanen |
| *(Dihitung sistem)* | `personnel_code` | `text` | NOT NULL (UNIQUE) | `PRS-0001` | Format `PRS-XXXX` zero-padded 4 digit | Identitas tampilan stabil, ditulis ke hasil export |
| `PROVINSI` | `province` | `text` | NULL | `"Sulawesi Selatan"` | Trim whitespace | 87 terisi, 1 distinct |
| `KABUPATEN/KOTA` | `district` | `text` | NULL | `"Bantaeng"`, `"Provinsi Sulawesi Selatan"` | Trim whitespace | 87 terisi, 25 distinct (24 kab/kota + 1 provinsi) |
| `NAMA` | `name` | `text` | NOT NULL | `"Ningsih Purwanti, Sh"`, `"Dr. Adnan Jamal, Sh.,mh"` | Trim whitespace, wajib diisi | 87 terisi, 87 unik. Memuat gelar |
| `JENIS KELAMIN` | `gender` | `text` | NULL | `"Perempuan"`, `"Laki-laki"` | Normalisasi ke `'L'` atau `'P'` | Check constraint: `check (gender in ('L','P'))` |
| `JABATAN` | `position` | `text` | NULL | `"Ketua"`, `"Anggota"` | Trim whitespace | 6 baris kosong di Excel, 81 terisi |
| `WAKORDIV` | `wakordiv` | `text` | NULL | `"Penanganan Pealggaran & Penyelesaian Sengketa"` | Trim whitespace | **CATATAN AUDIT:** Ada di Excel dan dipakai frontend (`r.wakordiv`), wajib ditambahkan ke tabel |
| `DIVISI` | `division` | `text` | NULL | `"Sumber Daya Manusia Organisasi, Diklat, Datin"` | Trim whitespace | 86 terisi, 1 kosong |
| `AMJ` (bagian awal) | `term_start` | `date` | NULL | `2023-01-01` | Diekstrak dari teks rentang `"2023 - 2028"` | Default awal tahun bila hanya tertulis tahun |
| `AMJ` (bagian akhir) | `term_end` | `date` | NULL | `2028-12-31`, `2028-05-13` | Dari rentang `"2028-12-31"` atau tanggal pasti | 80 baris bernilai `"2023 - 2028"`, 7 baris bernilai `"2028-05-13"` |
| `AMJ` (nilai mentah) | `term_raw` | `text` | NULL | `"2023 - 2028"`, `"2028-05-13"` | Disimpan as-is untuk export lossless | Menjaga format tampilan lama di UI/export |
| `AGAMA` | `religion` | `text` | NULL | `"Islam"`, `"Kristen"` | Trim whitespace | Kolom PII sensitif (dilarang di public view) |
| `PENDIDIKAN` | `education` | `text` | NULL | `"S1"`, `"S2"`, `"S3"` | Normalisasi jenjang | Kolom internal profil |
| `HP` | `phone` | `text` | NULL | `"6285222607262"` | Trim, strip non-digit | Kolom PII sensitif (dilarang di public view), 1 kosong |
| `EMAIL PRIBADI` | `private_email` | `text` | NULL | `"ningsihpurwanti132@gmail.com"` | Lowercase, trim | Kolom PII sensitif (dilarang di public view) |
| `EMAIL KANTOR` | `office_email` | `text` | NULL | `"set.bantaeng@bawaslu.go.id"` | Lowercase, trim | Boleh diakses via public view |
| `ALAMAT` | `office_address` | `text` | NULL | `"BTN.Griya Labandu Blok D3..."` | Trim whitespace | Catatan: berisi alamat rumah/kantor, dilarang di public view |
| `FACEBOOK` | `facebook` | `text` | NULL | `"Humas Bawaslu Bantaeng"` | Trim handle | Akun medsos resmi/pribadi |
| `INSTAGRAM` | `instagram` | `text` | NULL | `"bawaslubantaeng"` | Trim handle | Akun medsos resmi/pribadi |
| `WEBSITE` | `website` | `text` | NULL | `"http://bantaeng.bawaslu.go.id/"` | Format URL | URL website bawaslu kab/kota |
| `FOTO` | `photo_local_path` | `text` | NULL | `"assets/personel/ningsih-purwanti-sh.webp"` | Path relatif lokal apa adanya | File lama di disk TIDAK diubah |
| *(Dihasilkan Fase 5)* | `photo_object_path` | `text` | NULL | `"personnel/<uuid>/profile.webp"` | Path Storage bucket `public-photos` | Diisi hanya jika `photo_is_public` = true |
| *(Pengaturan Privasi)* | `photo_is_public` | `boolean` | NOT NULL | `false` | Default `false` | Menentukan apakah foto boleh diakses publik |
| *(Status Publikasi)* | `is_published` | `boolean` | NOT NULL | `false` | Default `false` | Filter utama public view |
| *(Optimistic Concurrency)* | `version` | `integer` | NOT NULL | `1` | Increment otomatis tiap UPDATE | Digunakan untuk optimistic concurrency control |
| *(Audit Trail)* | `created_at` | `timestamptz` | NOT NULL | `now()` | Otomatis | Waktu pembuatan record |
| *(Audit Trail)* | `updated_at` | `timestamptz` | NOT NULL | `now()` | Trigger `set_updated_at()` | Waktu modifikasi record |
| *(Soft Delete)* | `deleted_at` | `timestamptz` | NULL | `NULL` | Timestamp saat dihapus | Menghindari hard-delete |

---

## 2. Tabel Relasi: `api.awards`

Sumber data: `data/penghargaan.json` (20 entri penghargaan).

| Properti JSON Asli | Kolom Database (`api.awards`) | Tipe Data Postgres | Nullable | Contoh Nilai Asli | Aturan Normalisasi / Transformasi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| *(Dihasilkan sistem)* | `id` | `uuid` | NOT NULL (PK) | `gen_random_uuid()` | UUID v4 |
| `kabkota` + `nama` | `personnel_id` | `uuid` | NOT NULL (FK) | UUID dari `api.personnel(id)` | **DIPERBAIKI:** Relasi wajib via FK UUID, bukan nama teks |
| `penghargaan` | `title` | `text` | NOT NULL | `"Narasumber Pendidikan Pengawas..."` | Judul penghargaan/kegiatan |
| `kategori` | `category` | `text` | NULL | `"Narasumber"`, `"Prestasi"` | Jika kosong, auto-detect via `awardCategory()` |
| `instansi` / pemberi | `issuer` | `text` | NULL | `"Bawaslu RI"` / NULL | Lembaga pemberi penghargaan |
| `tanggal` | `awarded_on` | `date` | NULL | `NULL` / tanggal spesifik | Tanggal perolehan penghargaan |
| `bukti` | `proof_local_path` | `text` | NULL | `"assets/awards/jeneponto/eric-fhatur-rahman/..."` | Path berkas lokal, tidak diunggah ke storage publik |
| `is_published` | `is_published` | `boolean` | NOT NULL | `false` | Default `false` |
| *(Audit Trail)* | `created_at` | `timestamptz` | NOT NULL | `now()` | Otomatis |
| *(Audit Trail)* | `updated_at` | `timestamptz` | NOT NULL | `now()` | Trigger `set_updated_at()` |

---

## 3. Kontrak Kompatibilitas Endpoint Frontend

| Endpoint | Method | Kebutuhan Field Frontend | Bentuk Respon Server (DB Supabase) |
| :--- | :--- | :--- | :--- |
| `/api/data` | GET | `grid` (array of arrays ber-header) atau format kompatibel, `sheetName`, `lastModified`, `mtime` | Menyusun grid dari `api.personnel` (where deleted_at is null), menyertakan kolom `id` dan `version` secara additive |
| `/api/save` | POST | `{ rows: [...], baseMtime, confirmBulkDelete }` | Menerima array objek `rows`, membandingkan diff per record terhadap DB, melakukan insert/update/soft delete per record dengan kontrol `version` |
| `/api/upload-photo` | POST | Multipart: `photo`, `nama` | Simpan foto lokal ke `assets/personel/<slug>.webp`, kembalikan `{ ok: true, path, filename }` |
| `/api/rename-photo` | POST | JSON: `{ oldName, newName }` | Rename file di disk lokal, kembalikan `{ ok: true, renamed: true/false, newPath }` |
| `/api/upload-proof` | POST | Multipart: `proof`, `nama`, `kabkota` | Simpan bukti lokal ke `assets/awards/<kab>/<nama>/...`, kembalikan `{ ok: true, path, filename }` |
| `/api/save-awards` | POST | JSON: `{ awards: [...] }` | Upsert record ke `api.awards` per item dengan relasi `personnel_id` |
| `/api/stats` | GET | `{ ok: true, total, byGender: { male, female }, lastUpdate }` | Agregasi SQL langsung dari tabel `api.personnel` (`count(*)` dan `gender in ('L', 'P')`), memperbaiki bug kolom hardcoded `row[6]` |
