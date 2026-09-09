# Runbook Operasional Migrasi & Supabase (Runbook)

Panduan operasional lengkap untuk setup Supabase dari nol, menjalankan migrasi database, backup, pemulihan (restore), serta penanganan kondisi darurat/rollback.

---

## 1. Setup Supabase Project dari Nol

1. **Buat Project Baru di Supabase:**
   - Masuk ke [supabase.com](https://supabase.com).
   - Buat project baru (misal: `bawaslu-personel`).
   - Pilih region terdekat (misal: `Singapore (ap-southeast-1)`).
   - Catat **Database Password** di tempat aman.
2. **Pengaturan Schema Data API di Dashboard:**
   - Buka menu **Project Settings** -> **API**.
   - Pada bagian **Data API Settings** -> **Exposed Schemas**:
     - Tambahkan schema `api`.
     - (Opsional: nonaktifkan `public` bila hanya menggunakan schema `api`).
3. **Nonaktifkan Public Signup:**
   - Buka **Authentication** -> **Providers** -> **Email**.
   - Matikan (toggle OFF) **Enable Sign Up** agar publik tidak bisa membuat akun sendiri.
4. **Salin Kredensial ke `.env` Lokal:**
   - Dari menu **Project Settings** -> **API**, salin:
     - `Project URL` -> masukkan ke `SUPABASE_URL`
     - `anon / public key` -> masukkan ke `SUPABASE_ANON_KEY`
     - `service_role key` -> masukkan ke `SUPABASE_SERVICE_ROLE_KEY`
   - Pastikan berkas `.env` ada di root project dan tidak pernah dicommit ke Git:
     ```env
     HOST=127.0.0.1
     PORT=8080
     APP_TOKEN=bawaslu2024
     SUPABASE_URL=https://your-project-id.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=eyJh...
     SUPABASE_ANON_KEY=eyJh...
     ```

---

## 2. Menjalankan Migrasi Skema Database

Tersedia berkas siap pakai sekali klik di:
`supabase/SETUP_ALL_ONE_CLICK.sql`

**Langkah Eksekusi:**
1. Buka Supabase Dashboard -> **SQL Editor**.
2. Klik **New Query**.
3. Buka dan salin seluruh isi [supabase/SETUP_ALL_ONE_CLICK.sql](file:///d:/Arya%20Files/kuliah/KKP%20%28BAWASLU%29/Project/supabase/SETUP_ALL_ONE_CLICK.sql).
4. Tempel ke editor lalu klik **Run** (Ctrl + Enter).
5. Pastikan pesan sukses muncul (`Success. No rows returned`). Skema `api`, tabel `personnel`, `awards`, view publik, trigger, RLS, dan bucket `public-photos` kini telah aktif.

---

## 3. Eksekusi Script Migrasi Data

Semua script dijalankan dari terminal project lokal:

```bash
# 1. Uji coba import (Dry-Run / Simulasi tanpa menulis ke DB)
node scripts/import-xlsx.mjs

# 2. Eksekusi import sungguhan ke Supabase Postgres
node scripts/import-xlsx.mjs --commit

# 3. Sinkronisasi foto publik ke Supabase Storage (Bila ada personel yang dipublikasikan)
node scripts/sync-public-photos.mjs --dry-run
node scripts/sync-public-photos.mjs --commit

# 4. Verifikasi menyeluruh hasil migrasi (8 Kriteria Kualitas & Keamanan)
node scripts/verify-migration.mjs
```

---

## 4. Prosedur Backup & Restore

Karena Supabase Free tier tidak memiliki automated daily backup point-in-time, jalankan backup berkala:

### Backup
```bash
node scripts/backup-db.mjs
```
Script ini akan menghasilkan:
- `data/backup/db-backup-<timestamp>.json`
- `data/backup/db-backup-<timestamp>.xlsx` (multi-sheet: `personnel` dan `awards`).

### Export Dataset
```bash
node scripts/export-xlsx.mjs
```
Menghasilkan:
- `data/export/data-admin-latest.xlsx` (format Excel admin lengkap).
- `data/export/data-publik-latest.xlsx` (format non-PII publik).

---

## 5. Penanganan Bila Project Supabase Dipause (Free Plan)

Supabase Free plan akan menjeda (pause) project jika tidak ada aktivitas database selama 7 hari.

**Tanda-tanda Project Dipause:**
- Server backend mengembalikan error: `503 Database belum dikonfigurasi / Fetch failed / 500 Connection refused`.
- Di Supabase Dashboard muncul tombol kuning: **Restore Project**.

**Langkah Pemulihan:**
1. Buka dashboard Supabase project Anda.
2. Klik tombol **Restore Project** di bagian banner utama.
3. Tunggu 1–2 menit hingga status kembali **Active**.
4. Tidak ada data yang hilang; database akan kembali normal.
5. Jalankan `node scripts/verify-migration.mjs` untuk memastikan semua koneksi kembali terhubung.

---

## 6. Prosedur Rollback Darurat ke Berkas Excel

Bila terjadi kendala kritis pada koneksi internet atau server database dan sistem admin harus segera kembali beroperasi secara offline:

1. Kembalikan berkas server:
   ```bash
   cp server.legacy.bak.js server.js
   ```
2. Pastikan berkas `data/data.xlsx` tersedia di direktori `data/` (dapat diexport terlebih dahulu menggunakan `node scripts/export-xlsx.mjs` bila ada perubahan terbaru).
3. Restart server:
   ```bash
   npm run dev
   ```
   Aplikasi admin akan langsung kembali membaca dan menulis ke berkas Excel lokal.
