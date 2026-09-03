# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

## [2.0.0] - 2026-09-03

### 🔒 Keamanan Data (P0)

#### Optimistic Concurrency
- Implementasi optimistic concurrency control di `/api/save`
- Server memvalidasi `baseMtime` sebelum write
- Return 409 conflict bila data sudah berubah
- Klien menampilkan dialog reload dengan opsi force save

#### Guard Hapus Massal
- Validasi di klien: deteksi kehilangan >20% baris
- Dialog konfirmasi dengan list nama yang akan dihapus
- Server reject bila kehilangan >20% tanpa flag `confirmBulkDelete`

#### Validasi Penghargaan
- Validasi field wajib, panjang max, count per personel
- Rotasi backup `penghargaan.json` (10 file terakhir)
- Return 422 dengan detail error bila validasi gagal

#### Round-trip Excel
- Parse dengan `raw:true` untuk preserve tipe data
- NO sebagai number, AMJ ke ISO date YYYY-MM-DD
- Unit test untuk verifikasi type preservation

#### Dependencies
- `xlsx` dan `sharp` dipindah dari devDependencies ke dependencies
- Mendukung `npm ci --omit=dev` untuk production build

### 📊 Integritas Skema (P0)

#### Kolom ID Stabil
- Kolom ID (format `PRS-0001`, `PRS-0002`, dll) sebagai identifier unik
- assignStableIds() generate/preserve ID dari Excel
- Skrip migrasi `migrate-add-id.mjs` (idempoten, dengan backup)
- Skrip audit `reconcile-assets.mjs` (foto & awards vs Excel)

#### Satu Sumber Kebenaran
- EXCEL_COLUMNS dan KEY_TO_EXCEL_COLUMN di `schema.js`
- Server dan klien import dari schema.js
- README update untuk cocok dengan implementasi

#### Manifest Otomatis
- Generate manifest foto & awards saat server startup
- Hapus script manual `photos:manifest` dan `awards:manifest`
- Manifest: `assets/personel/index.json` dan `assets/awards/index.json`

#### Validasi di /api/save
- Import `validateRecord` dari schema.js
- Validasi field wajib, format email, dll sebelum write
- Return 422 dengan detail issues (max 10)

### 🔐 Keamanan LAN (P1)

#### Paksa APP_TOKEN
- Server exit 1 bila HOST bukan loopback dan APP_TOKEN kosong
- Default HOST = 127.0.0.1 (loopback, aman)
- Validasi keamanan di startup

#### Auth untuk Aset PII
- `/assets/personel/` dan `/assets/awards/` butuh auth
- Assets publik (CSS, JS, logo) tetap accessible
- Foto & sertifikat terlindungi

#### Magic Bytes Validation
- Upload foto: verifikasi magic bytes untuk JPEG/PNG/WebP/GIF
- Reject file berbahaya yang menyamar sebagai gambar
- Return 400 bila format tidak valid

#### Login via POST
- Endpoint login: POST `/api/login` dengan body JSON
- Cookie httpOnly, sameSite=lax, 12 jam expiry
- Halaman login HTML form (`login.html`)

#### .gitignore PII
- Tambah semua file PII: data.xlsx, backup/, foto, awards
- Cache files: .data-cache.json, migrations/
- README: dokumentasi cara bersihkan git history

#### CSP Headers
- Content Security Policy strict untuk LAN deployment
- default-src 'self', no inline scripts
- style-src 'unsafe-inline' sementara (akan diperbaiki)

### 🎨 UI Responsif (P1)

#### CSS Refactor
- Design tokens unified (hapus duplikasi `--r/--radius`, `--sh/--shadow`)
- Konsisten naming untuk semua variables
- Group logis: colors, brand, semantic, borders, shadows, motion

#### Accessibility
- Tab dengan focus ring visible (`outline: 2px solid var(--brand)`)
- `@media (hover: hover)` untuk batasi hover effects di touch devices
- `prefers-reduced-motion` support untuk disable animations
- Keyboard navigation untuk semua interactive elements

#### Responsive Layout
- Filter bar: responsive grid adaptif (auto-fit minmax)
- Directory cards: minmax(280px, 1fr)
- Charts: minmax(340px, 1fr)
- Mobile breakpoint: 720px

#### Avatar System
- Unified avatar component dengan size modifiers (sm, md, lg, xl)
- Fallback: initials dari nama
- Smooth fade-in animation untuk foto
- Tanpa inline styles

#### Table Improvements
- Sticky first column (NO) dengan z-index layering
- Sticky header dengan proper background
- Empty state message
- Responsive horizontal scroll

#### Modal
- Full screen modal untuk Add Data form
- Sticky header & footer
- Max-width 1200px untuk readability
- Mobile responsive padding

### 🔄 Flow Fitur

#### Login Flow
- Halaman login HTML form dengan UX modern
- Loading state dengan spinner
- Error handling dengan alert messages
- Auto-focus input token

#### Stats API
- GET `/api/stats` tanpa auth untuk landing page
- Return: total personel, by gender, last update
- Tidak expose PII

#### Normalisasi Input
- Schema.js: normalizeRecord() untuk semua input
- Phone: format 62xxxxxxxxxx
- Email: validasi format
- Handle: extract dari URL sosial media

### 🚀 Deployment

#### Offline Support
- Dependencies lokal (npm install offline dari cache)
- Manifest auto-generate (tidak perlu npm run manual)
- Static assets self-hosted

#### Production Ready
- Atomic writes dengan backup (10 rotasi)
- Gzip compression untuk semua responses
- Security headers lengkap (CSP, X-Frame-Options, dll)
- Logging dengan timestamp

### 📝 Dokumentasi

#### README
- Dokumentasi keamanan lengkap
- Cara deployment ke LAN dengan APP_TOKEN
- Instruksi bersihkan git history PII
- Kolom ID dan cara migrasi

#### Scripts
- `npm run migrate:add-id` - Tambah kolom ID ke data.xlsx
- `npm run migrate:reconcile` - Audit foto & awards vs Excel
- `npm run validate` - Validasi data.xlsx

## [1.0.0] - 2025-02-xx

### Fitur Awal
- Dashboard analitik dengan Chart.js
- Direktori personel dengan pencarian
- Upload foto & penghargaan
- Export Excel
- Landing page

---

Format: [Major.Minor.Patch]
- **Major**: Breaking changes atau perubahan arsitektur besar
- **Minor**: Fitur baru backward-compatible
- **Patch**: Bug fixes dan improvements kecil
