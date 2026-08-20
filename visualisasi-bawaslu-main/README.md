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

NO, PROVINSI, NAMA, JENIS KELAMIN, JABATAN, WAKOR, DIV, AM, JAGA, AGAMA,
JENJANG PENDIDIKAN, NOMOR HP/WHATSAPP, E-MAIL PRIBADI, E-MAIL KANTOR,
ALAMAT KANTOR, FACEBOOK, INSTAGRAM, WEBSITE.

Variasi penulisan header ditangani otomatis (mis. `NO. HP`, `WA`, `IG`, `E-MAIL DINAS`).
Untuk menambah kolom baru, ubah `FIELDS` dan `HEADER_RULES` pada `assets/js/schema.js`.

## Keamanan & Privasi (UU PDP)

Berkas Excel berisi data pribadi (nomor telepon, e-mail). Bila di-deploy ke internet publik, Anda **WAJIB**:
1. Mengaktifkan HTTPS.
2. Memasang autentikasi (Basic Auth, SSO, atau VPN kantor) di web server (misalnya Nginx atau Apache).
3. Melindungi akses fisik dan digital ke berkas `data/data.xlsx`.