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

**NO, PROVINSI, KABUPATEN/KOTA, NO URUT, NAMA, JENIS KELAMIN, JABATAN, WAKORDIV, DIVISI, AMJ, AGAMA, PENDIDIKAN, HP, EMAIL PRIBADI, EMAIL KANTOR, ALAMAT, FACEBOOK, INSTAGRAM, WEBSITE, FOTO**

Variasi penulisan header ditangani otomatis, misalnya:
- `NO. HP`, `NOMOR HP`, `WA` → `HP`
- `E-MAIL DINAS`, `EMAIL KANTOR` → `EMAIL KANTOR`
- `IG` → `INSTAGRAM`
- `JENJANG PENDIDIKAN` → `PENDIDIKAN`

Untuk menambah kolom baru atau mengubah urutan, edit **satu sumber kebenaran** di `assets/js/schema.js`:
- `EXCEL_COLUMNS`: urutan kolom saat menulis ke Excel
- `KEY_TO_EXCEL_COLUMN`: mapping key internal → nama kolom Excel
- `FIELDS`: definisi lengkap untuk UI dan validasi
- `HEADER_RULES`: aturan pengenalan variasi nama header

## Keamanan & Privasi (UU PDP)

Berkas Excel berisi data pribadi (nomor telepon, e-mail). Bila di-deploy ke internet publik, Anda **WAJIB**:
1. Mengaktifkan HTTPS.
2. Memasang autentikasi (Basic Auth, SSO, atau VPN kantor) di web server (misalnya Nginx atau Apache).
3. Melindungi akses fisik dan digital ke berkas `data/data.xlsx`.