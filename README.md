# Direktori & Dashboard Personel

Aplikasi web statis untuk menampilkan direktori personel dan analitiknya.
Sumber data tunggal berupa satu berkas Excel di `data/data.xlsx`.

## Fitur Utama

- **Analitik & Ringkasan**: Dashboard visual sebaran personel, agama, pendidikan, jabatan, dan kelengkapan atribut menggunakan Chart.js.
- **Direktori & Pencarian**: Pencarian cepat berbasis nama, jabatan, kontak, email, instansi, atau alamat.
- **Kualitas Data**: Deteksi otomatis data kosong (kesalahan) atau data duplikat (peringatan).
- **Keamanan PII**: Menggunakan `sessionStorage` dengan pengkodean data, sehingga data sensitif terhapus otomatis saat tab ditutup dan terlindung dari ekstensi browser nakal.
- **Aksesibilitas (ARIA)**: Sepenuhnya mematuhi standar aksesibilitas keyboard dan pembaca layar.

## Menjalankan secara lokal

### 🚀 Cara Tercepat (Windows):

**Langsung jalankan (auto-close terminal):**
```batch
start.bat
```
Server langsung jalan di background, terminal otomatis tertutup.

**Atau menggunakan Control Panel:**
```batch
bawaslu.bat
```
Menu interaktif untuk semua operasi server.

**Pilihan lainnya:**
```batch
start-window.bat       # Lihat log di window terpisah
start-local.bat        # Server lokal tanpa tunnel
```

**Menghentikan server:**
```batch
stop.bat               # Hentikan server (auto-close)
status.bat             # Cek status server
```

> 📚 **Dokumentasi lengkap**: Lihat [SCRIPTS_GUIDE.md](SCRIPTS_GUIDE.md) atau [QUICK_START.txt](QUICK_START.txt)

### 🐧 Cara Manual (Cross-platform):

Jalankan perintah berikut:

```bash
npm install        # Pasang dependensi
npm run dev        # Jalankan server lokal di http://localhost:8080
```

Atau tanpa Node.js (untuk sekadar melihat dashboard):

```bash
python3 -m http.server 8080
```

> **PENTING**: Jangan membuka `index.html` langsung dari berkas (`file://`) — browser memblokir pembacaan berkas data melalui protokol tersebut.

## Penjaminan Kualitas & Pengujian

Aplikasi ini dilengkapi dengan rangkaian pengujian unit (unit testing) dan standar kualitas kode industri.

```bash
npm run test           # Menjalankan unit test sekali
npm run test:watch     # Menjalankan unit test dengan watch mode
npm run test:coverage  # Menjalankan test dengan laporan cakupan (coverage)
npm run lint           # Memeriksa standardisasi kode dengan ESLint
npm run format         # Merapikan format kode dengan Prettier
npm run validate       # Memvalidasi berkas data Excel
```

## Memperbarui data

1. Timpa `data/data.xlsx` dengan versi terbaru.
2. Jalankan `npm run validate` untuk memastikan tidak ada kesalahan format.
3. Muat ulang halaman, lalu klik **Muat Ulang Data** untuk melewati cache.

## Struktur kolom yang dikenali

Kolom berikut dikenali otomatis (variasi penulisan header ditangani oleh `HEADER_RULES` di `assets/js/schema.js`):

**ID, NO, PROVINSI, KABUPATEN/KOTA, NO URUT, NAMA, JENIS KELAMIN, JABATAN, WAKORDIV, DIVISI, AMJ, AGAMA, PENDIDIKAN, HP, EMAIL PRIBADI, EMAIL KANTOR, ALAMAT, FACEBOOK, INSTAGRAM, WEBSITE, FOTO**

Variasi penulisan header ditangani otomatis, misalnya:
- `IDPERSONEL`, `PERSONELID` → `ID`
- `NO. HP`, `NOMOR HP`, `WA` → `HP`
- `E-MAIL DINAS`, `EMAIL KANTOR` → `EMAIL KANTOR`
- `IG` → `INSTAGRAM`
- `JENJANG PENDIDIKAN` → `PENDIDIKAN`

**Kolom ID:** Identifier unik stabil untuk setiap personel (format: `PRS-0001`, `PRS-0002`, dll). Bila file Excel Anda belum memiliki kolom ID, jalankan migrasi otomatis:
```bash
npm run migrate:add-id
```

Untuk menambah kolom baru atau mengubah urutan, edit **satu sumber kebenaran** di `assets/js/schema.js`:
- `EXCEL_COLUMNS`: urutan kolom saat menulis ke Excel
- `KEY_TO_EXCEL_COLUMN`: mapping key internal → nama kolom Excel
- `FIELDS`: definisi lengkap untuk UI dan validasi
- `HEADER_RULES`: aturan pengenalan variasi nama header

## Keamanan & Privasi (UU PDP)

Aplikasi ini menangani **data pribadi** (PII): nama, nomor telepon, email, foto personel, dan sertifikat penghargaan.

### Keamanan Built-in

- **Token autentikasi**: `APP_TOKEN` wajib diisi bila server diakses dari jaringan (HOST bukan 127.0.0.1). Server menolak start bila aturan ini dilanggar.
- **Auth untuk aset PII**: Foto personel (`/assets/personel/`) dan penghargaan (`/assets/awards/`) memerlukan autentikasi.
- **Login aman**: POST `/api/login` dengan body JSON (bukan query string di URL yang ter-log di access log).
- **Upload validation**: Magic bytes verification untuk mencegah upload file berbahaya yang menyamar sebagai gambar.
- **Atomic writes**: Backup otomatis sebelum setiap perubahan data, tulis ke temp file lalu rename (atomik).

### Deployment ke Jaringan LAN

Bila di-deploy ke LAN kantor:

1. **Set APP_TOKEN** di environment variable:
   ```bash
   APP_TOKEN="token-rahasia-anda" HOST=0.0.0.0 npm start
   ```

2. **Gunakan HTTPS** (wajib untuk production):
   - Pasang reverse proxy (Nginx/Apache) dengan TLS certificate
   - Atau set `HTTPS=true` bila deploy di platform yang support

3. **Git history PII**: Bila repo akan di-share, bersihkan history PII dari git:
   ```bash
   # PERINGATAN: operasi ini destructive, backup dulu!
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch data/data.xlsx data/penghargaan.json assets/personel/*.webp assets/awards/*" \
     --prune-empty --tag-name-filter cat -- --all
   ```

4. **VPN atau IP Whitelist**: Batasi akses hanya dari IP kantor menggunakan firewall atau reverse proxy.

### Catatan Penting

- File PII sudah ada di `.gitignore`, tapi **history lama** mungkin masih berisi data sensitif
- Default HOST adalah `127.0.0.1` (loopback) untuk keamanan maksimal
- Jangan expose server ke internet publik tanpa HTTPS + autentikasi tambahan (SSO/VPN)