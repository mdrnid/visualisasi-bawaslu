# Perbaikan Tampilan Card untuk Data Bawaslu Provinsi

## Masalah
Card di halaman direktori menampilkan label kosong/tidak jelas untuk data personel Bawaslu tingkat Provinsi karena kolom `KABUPATEN/KOTA` berisi nilai yang sama dengan kolom `PROVINSI` (contoh: "SULAWESI SELATAN").

## Data yang Terpengaruh
Terdapat 7 baris data di `data/data.xlsx` (baris 83-89) dengan:
- **PROVINSI**: SULAWESI SELATAN
- **KABUPATEN/KOTA**: SULAWESI SELATAN (seharusnya ini data Bawaslu Provinsi)

Personel yang terpengaruh:
1. Mardiana Rusli, SE.,M.Ikom (Ketua)
2. Dr. Adnan Jamal, SH.,MH
3. Drs. Saiful Jihad, M.AG
4. Andarias Duma', SH.,MH
5. Dr. H. Samsuar Saleh, S.IP.,M.Si
6. Alamsyah, SH
7. Dr. Abdul Malik, S.HI.,M.HI

## Solusi yang Diterapkan

### 1. Perubahan pada `assets/js/schema.js`
Menambahkan logika normalisasi di fungsi `normalizeRecord()`:

```javascript
// Perbaikan: jika kabkota sama dengan provinsi, ubah menjadi format "Provinsi [Nama]"
// untuk membedakan data Bawaslu Provinsi dengan Kabupaten/Kota
if (rec.provinsi && rec.kabkota && 
    slug(rec.provinsi) === slug(rec.kabkota)) {
    rec.kabkota = 'Provinsi ' + rec.provinsi;
}
```

**Fungsi `slug()`** menghapus spasi dan karakter khusus, sehingga perbandingan tidak terpengaruh oleh:
- Kapitalisasi (SULAWESI SELATAN vs Sulawesi Selatan)
- Spasi ekstra
- Karakter khusus

### 2. Hasil Setelah Perbaikan

**Sebelum:**
- Provinsi: "Sulawesi Selatan"
- Kab/Kota: "Sulawesi Selatan"
- Card menampilkan: (tidak jelas, terlihat duplikat)

**Sesudah:**
- Provinsi: "Sulawesi Selatan"  
- Kab/Kota: "**Provinsi Sulawesi Selatan**"
- Card menampilkan: Label yang jelas dan deskriptif

### 3. Unit Tests
Menambahkan 2 test case baru di `tests/schema.test.js`:

✅ **Test 1**: Memverifikasi konversi kabkota yang cocok dengan provinsi
```javascript
const raw = {
    provinsi: 'SULAWESI SELATAN',
    kabkota: 'SULAWESI SELATAN',
    nama: 'MARDIANA RUSLI',
};
const normalized = normalizeRecord(raw, 0);
expect(normalized.kabkota).toBe('Provinsi Sulawesi Selatan');
```

✅ **Test 2**: Memastikan kabkota yang berbeda tetap tidak berubah
```javascript
const raw = {
    provinsi: 'SULAWESI SELATAN',
    kabkota: 'BONE',
    nama: 'ALWI',
};
const normalized = normalizeRecord(raw, 0);
expect(normalized.kabkota).toBe('Bone'); // tidak berubah
```

### 4. Hasil Pengujian
```
✓ tests/schema.test.js (8 tests) 11ms
  ✓ normalizeRecord() (2)
    ✓ should convert matching provinsi and kabkota to "Provinsi [Name]" format
    ✓ should keep different kabkota values unchanged

Test Files  4 passed (4)
     Tests  29 passed (29)
```

## Dampak Perbaikan

### ✅ Yang Terpengaruh:
1. **Tampilan Card** - Menampilkan label "Provinsi Sulawesi Selatan" yang lebih jelas
2. **Filter Kabupaten/Kota** - Data provinsi muncul dengan label "Provinsi [Nama]"
3. **Faceted Search** - Kategori filter yang lebih deskriptif
4. **URL & Deep Links** - ID record tetap stabil dan unik

### ✅ Yang TIDAK Terpengaruh:
1. **Data Excel asli** - Tidak ada perubahan pada file `data.xlsx`
2. **Data kabupaten/kota lain** - Hanya normalisasi yang cocok dengan provinsi
3. **Logika bisnis lain** - Validasi, pencarian, dan analytics tetap berjalan normal
4. **Backward compatibility** - Sistem tetap membaca data lama dengan benar

## Cara Menggunakan

### Untuk Developer:
1. Pull perubahan dari repository
2. Jalankan `npm test` untuk memverifikasi
3. Jalankan `npm run dev` untuk melihat hasilnya

### Untuk User:
1. Buka aplikasi di browser
2. Refresh halaman (Ctrl+F5) untuk clear cache
3. Klik tombol "Muat Ulang Data" jika diperlukan
4. Card untuk Bawaslu Provinsi sekarang menampilkan "Provinsi Sulawesi Selatan"

## Catatan Tambahan

Perbaikan ini adalah **client-side normalization** yang:
- Tidak mengubah data sumber (Excel)
- Bersifat otomatis dan transparan
- Dapat diterapkan untuk provinsi lain yang memiliki pola data serupa
- Tidak memerlukan migrasi data

Jika di masa depan ada data provinsi lain dengan pola yang sama (misalnya: JAWA BARAT di kolom provinsi dan kabkota), sistem akan secara otomatis mengubahnya menjadi "Provinsi Jawa Barat".
