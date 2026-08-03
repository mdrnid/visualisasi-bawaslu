# Direktori & Dashboard Personel

Aplikasi web statis untuk menampilkan direktori personel dan analitiknya.
Sumber data tunggal berupa satu berkas Excel di `data/data.xlsx`.

## Menjalankan secara lokal

    npm run dev        # http://localhost:8080

Atau tanpa Node.js:

    python3 -m http.server 8080

> Jangan membuka `index.html` langsung dari berkas (`file://`) — browser memblokir
> pembacaan berkas data melalui protokol tersebut.

## Memperbarui data

1. Timpa `data/data.xlsx` dengan versi terbaru.
2. Jalankan `npm run validate` untuk memastikan tidak ada kesalahan.
3. Muat ulang halaman, lalu klik **Muat Ulang Data** untuk melewati cache.

## Struktur kolom yang dikenali

NO, PROVINSI, NAMA, JENIS KELAMIN, JABATAN, WAKOR, DIV, AM, JAGA, AGAMA,
JENJANG PENDIDIKAN, NOMOR HP/WHATSAPP, E-MAIL PRIBADI, E-MAIL KANTOR,
ALAMAT KANTOR, FACEBOOK, INSTAGRAM, WEBSITE.

Variasi penulisan header ditangani otomatis (mis. `NO. HP`, `WA`, `IG`, `E-MAIL DINAS`).
Untuk menambah kolom baru, ubah `FIELDS` dan `HEADER_RULES` pada `assets/js/schema.js`.

## Deploy

Aplikasi ini sepenuhnya statis, jadi cukup unggah seluruh folder ke:

- GitHub Pages (aktifkan Pages pada branch `main`, folder `/`)
- Netlify / Vercel (drag & drop folder, tanpa perintah build)
- Nginx / Apache internal (letakkan di document root)

## Catatan keamanan

Berkas berisi data pribadi (nomor telepon, e-mail). Bila di-deploy ke internet
publik, letakkan di balik autentikasi (Basic Auth, SSO, atau VPN kantor).