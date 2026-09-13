# Panduan Instalasi & Setup Proyek di Device / Laptop Lain

Dokumen ini berisi panduan lengkap langkah-demi-langkah untuk memasang, mengonfigurasi database Supabase, dan menjalankan aplikasi **Direktori & Dashboard Personel Bawaslu (BIPAL)** pada komputer atau laptop baru.

---

## Daftar Isi
1. [Prasyarat Perangkat Lunak](#1-prasyarat-perangkat-lunak)
2. [Menyalin / Memindahkan Proyek](#2-menyalin--memindahkan-proyek)
3. [Memasang Dependensi (Dependencies)](#3-memasang-dependensi-dependencies)
4. [Konfigurasi Environment (.env)](#4-konfigurasi-environment-env)
5. [Setup Database Supabase](#5-setup-database-supabase)
   - [Skenario A: Menggunakan Database Supabase yang Sudah Ada (Paling Cepat)](#skenario-a-menggunakan-database-yang-sudah-ada)
   - [Skenario B: Membuat Database / Project Supabase Baru dari Nol](#skenario-b-membuat-project-supabase-baru-dari-nol)
6. [Menjalankan Aplikasi](#6-menjalankan-aplikasi)
7. [Akses dari Device Lain (Jaringan LAN / Wi-Fi Kantor)](#7-akses-dari-device-lain-jaringan-lan--wi-fi-kantor)
8. [Troubleshooting (Tanya Jawab Masalah Umum)](#8-troubleshooting)

---

## 1. Prasyarat Perangkat Lunak

Sebelum memulai di komputer baru, pastikan perangkat lunak berikut sudah terpasang:

1. **Node.js (LTS Version 18.x atau 20.x+)**:
   - Unduh dari: [https://nodejs.org](https://nodejs.org)
   - Pastikan terpasang dengan mengecek di Terminal / PowerShell:
     ```bash
     node -v
     npm -v
     ```
2. **Git** (Opsional, jika memindahkan proyek via repository GitHub):
   - Unduh dari: [https://git-scm.com](https://git-scm.com)
3. **Web Browser Modern** (Google Chrome, Microsoft Edge, atau Mozilla Firefox).

---

## 2. Menyalin / Memindahkan Proyek

Pilih salah satu cara memindahkan folder proyek ke laptop/komputer baru:

* **Cara 1: Flashdisk / File Sharing (Manual)**
  Salin seluruh folder proyek `Project/` ke laptop baru (misal diletakkan di `D:\Project` atau `C:\Users\NamaUser\Project`).
  *(Tips: Anda tidak perlu menyalin folder `node_modules` karena ukurannya besar; folder tersebut bisa dibuat ulang nanti)*.

* **Cara 2: Git Clone (Jika menggunakan GitHub/GitLab)**
  Buka Terminal/PowerShell di laptop baru, lalu jalankan:
  ```bash
  git clone <URL_REPOSITORY_ANDA>
  cd <NAMA_FOLDER_PROJECT>
  ```

---

## 3. Memasang Dependensi (Dependencies)

1. Buka Terminal / PowerShell di laptop baru.
2. Masuk ke direktori proyek:
   ```bash
   cd "D:\Path\Ke\Folder\Project"
   ```
3. Jalankan perintah instalasi pustaka:
   ```bash
   npm install
   ```
   *Tunggu hingga proses selesai dan folder `node_modules` berhasil dibuat.*

---

## 4. Konfigurasi Environment (`.env`)

Buat file baru bernama **`.env`** di dalam folder utama (*root*) proyek (sejajar dengan `package.json` dan `server.js`).

Isi file `.env` dengan format berikut:

```env
HOST=0.0.0.0
PORT=8080
APP_TOKEN=

SUPABASE_URL=https://hhluwlhtsbzmfdrojdwx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Catatan Pengaturan:**
> - `APP_TOKEN=`: Dikosongkan agar aplikasi langsung terbuka ke Dashboard BIPAL tanpa login.
> - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`: Sesuaikan dengan kredensial project Supabase yang digunakan.

---

## 5. Setup Database Supabase

Pilih salah satu dari 2 skenario di bawah ini:

### Skenario A: Menggunakan Database yang Sudah Ada
*(Rekomendasi jika laptop baru ini hanya ingin mengakses data yang sama dengan laptop utama).*

1. Anda **tidak perlu menjalankan setup database lagi**.
2. Cukup pastikan nilai `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` pada file `.env` di laptop baru **sama persis** dengan yang ada di laptop pertama.
3. Database PostgreSQL dan Storage Supabase langsung terhubung secara *real-time*.

---

### Skenario B: Membuat Project Supabase Baru dari Nol
*(Pilih ini jika ingin membuat lingkungan database yang terpisah/baru).*

1. **Buat Project Baru di Supabase:**
   - Login ke [https://supabase.com/dashboard](https://supabase.com/dashboard).
   - Klik **New Project**, pilih nama proyek dan buat *database password*.
2. **Jalankan Setup Skema Database (One-Click):**
   - Di dashboard Supabase, buka menu **SQL Editor** (ikon `</>`).
   - Buka file [`supabase/SETUP_ALL_ONE_CLICK.sql`](../supabase/SETUP_ALL_ONE_CLICK.sql) di laptop Anda.
   - Blok semua teks (**Ctrl + A**), lalu salin (**Ctrl + C**).
   - Tempel (**Ctrl + V**) ke SQL Editor Supabase, lalu klik tombol **Run**.
   - Pastikan muncul pesan hijau *"Success. No rows returned"*.
3. **Beri Hak Akses Skema (Schema Privileges):**
   - Masih di SQL Editor Supabase, jalankan query berikut untuk memastikan backend memiliki izin penuh:
     ```sql
     grant usage on schema api to anon, authenticated, service_role, postgres, authenticator;
     grant all privileges on all tables in schema api to service_role, postgres;
     grant all privileges on all sequences in schema api to service_role, postgres;
     grant all privileges on all routines in schema api to service_role, postgres;
     alter default privileges in schema api grant all on tables to service_role, postgres;
     alter default privileges in schema api grant all on sequences to service_role, postgres;
     ```
4. **Perbarui `.env`:**
   - Buka **Project Settings** (⚙️) -> **API**.
   - Salin **Project URL**, **anon key**, dan **service_role key**, lalu tempelkan ke file `.env`.
5. **Impor Data Awal dari File Lokal ke Supabase:**
   - Di terminal laptop baru, jalankan:
     ```bash
     # 1. Impor data Personel (Excel) dan Penghargaan (JSON)
     node scripts/import-xlsx.mjs --commit

     # 2. Sinkronisasi berkas PDF sertifikat ke Supabase Storage
     node scripts/sync-award-proofs.mjs --commit

     # 3. (Opsional) Sinkronisasi foto profil publik ke Supabase Storage
     node scripts/sync-public-photos.mjs --commit
     ```
6. **Verifikasi Hasil:**
   - Jalankan script pengujian:
     ```bash
     node scripts/verify-migration.mjs
     ```
   - Pastikan hasilnya menunjukkan `8 / 8 PENGUJIAN LULUS`.

---

## 6. Menjalankan Aplikasi

1. Buka Terminal / PowerShell di folder proyek.
2. Jalankan perintah:
   ```bash
   npm start
   ```
3. Terminal akan menampilkan pesan:
   ```text
   [auth] Mode tanpa autentikasi: langsung akses dashboard tanpa login.
   Server berjalan di http://0.0.0.0:8080
   Mode database: Supabase Postgres (schema: api)
   ```
4. Buka browser Anda dan akses:
   👉 **`http://localhost:8080`**

Dashboard BIPAL akan langsung tampil lengkap beserta seluruh data personel dan sertifikat penghargaan!

---

## 7. Akses dari Device Lain (Jaringan LAN / Wi-Fi Kantor)

Jika server dijalankan di satu laptop dan ingin dibuka dari komputer/HP lain yang terhubung di Wi-Fi yang sama:

1. **Cari IP Address Laptop Server:**
   - Di Windows: Buka CMD/PowerShell, ketik `ipconfig`.
   - Cari baris `IPv4 Address`, contoh: `192.168.1.50`.
2. **Buka Akses Firewall (Sekali Saja di Laptop Server):**
   - Klik kanan file `setup-firewall.bat`, lalu pilih **Run as administrator**.
3. **Buka dari Device Lain:**
   - Di browser HP atau komputer lain, buka:
     `http://192.168.1.50:8080` *(ganti dengan IP laptop server Anda)*.

---

## 8. Troubleshooting

| Masalah | Penyebab | Solusi |
| :--- | :--- | :--- |
| **`EADDRINUSE :::8080`** | Port 8080 masih digunakan oleh proses Node.js sebelumnya. | Buka Task Manager, hentikan proses "Node.js", atau ganti `PORT=8081` di `.env`. |
| **`permission denied for schema api`** | Izin skema `api` belum diberikan ke service role Supabase. | Jalankan script SQL hak akses (Langkah 5 Skenario B Poin 3) di SQL Editor Supabase. |
| **Tabel tidak terlihat di Supabase Dashboard** | Dashboard Supabase default menampilkan schema `public`. | Di menu **Table Editor**, klik dropdown **schema public** di pojok kiri atas dan ubah ke **`api`**. |
| **Pesan `Tidak diizinkan...` (401)** | Token autentikasi aktif di `.env`. | Kosongkan nilai `APP_TOKEN=` di `.env`, lalu restart server (`npm start`). |
