# Direktori Berkas Bukti Penghargaan & Prestasi

Folder ini digunakan untuk menyimpan berkas bukti penghargaan (sertifikat, piagam, foto, SK, dokumen PDF) secara lokal.

## Struktur yang Dianjurkan:
```text
assets/awards/
  └── [kabkota]/
        └── [nama-personel]/
              ├── 01-nama-kegiatan.pdf
              ├── 02-nama-kegiatan.jpg
              └── ...
```

Contoh:
- `assets/awards/jeneponto/bustanil-nassa/01-drafter-putusan-terbaik-3.pdf`
- `assets/awards/bone/nur-alim/01-perkara-pidana-terbanyak.pdf`

## Format yang didukung:
- Dokumen: `.pdf`
- Gambar: `.jpg`, `.jpeg`, `.png`, `.webp`

## Setelah menambah/mengubah berkas:
Jalankan perintah berikut di terminal untuk memperbarui indeks:
```bash
npm run awards:manifest
```
