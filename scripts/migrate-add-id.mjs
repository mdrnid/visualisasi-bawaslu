#!/usr/bin/env node
/**
 * Migrasi: Tambahkan kolom ID ke data.xlsx
 * 
 * Skrip ini:
 * 1. Membaca data.xlsx
 * 2. Memeriksa apakah kolom ID sudah ada
 * 3. Bila belum, generate ID format PRS-XXXX untuk setiap baris
 * 4. Backup file asli ke data/backup/pre-id-migration/
 * 5. Menulis file dengan kolom ID baru
 * 
 * Idempoten: aman dijalankan berkali-kali.
 */

import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.xlsx');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backup', 'pre-id-migration');

function main() {
    console.log('[migrate] Memulai migrasi: Tambah kolom ID');
    console.log('[migrate] File target:', DATA_FILE);
    
    if (!fs.existsSync(DATA_FILE)) {
        console.error('[migrate] ❌ File data.xlsx tidak ditemukan!');
        process.exit(1);
    }
    
    // 1. Baca workbook
    console.log('[migrate] Membaca data.xlsx...');
    const workbook = XLSX.readFile(DATA_FILE, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    if (!sheet) {
        console.error('[migrate] ❌ Sheet tidak ditemukan!');
        process.exit(1);
    }
    
    // 2. Konversi ke array of objects dengan header asli
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    console.log(`[migrate] Terbaca ${data.length} baris data`);
    
    // 3. Cek apakah kolom ID sudah ada
    if (data.length > 0 && data[0].hasOwnProperty('ID')) {
        console.log('[migrate] ✓ Kolom ID sudah ada. Tidak perlu migrasi.');
        console.log('[migrate] Selesai.');
        process.exit(0);
    }
    
    // 4. Backup file asli
    console.log('[migrate] Membuat backup...');
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupFile = path.join(BACKUP_DIR, 'data.xlsx');
    fs.copyFileSync(DATA_FILE, backupFile);
    console.log('[migrate] ✓ Backup disimpan:', backupFile);
    
    // 5. Tambahkan kolom ID di setiap baris
    console.log('[migrate] Menambahkan kolom ID...');
    let counter = 1;
    const updatedData = data.map((row) => {
        const id = `PRS-${String(counter).padStart(4, '0')}`;
        counter++;
        // ID harus di posisi pertama
        return { ID: id, ...row };
    });
    
    console.log(`[migrate] ✓ ${updatedData.length} baris diberi ID (PRS-0001 s/d PRS-${String(counter - 1).padStart(4, '0')})`);
    
    // 6. Tulis kembali ke Excel dengan header eksplisit
    console.log('[migrate] Menulis ke data.xlsx...');
    
    const EXCEL_COLUMNS = [
        'ID', 'NO', 'PROVINSI', 'KABUPATEN/KOTA', 'NO URUT', 'NAMA', 'JENIS KELAMIN', 
        'JABATAN', 'WAKORDIV', 'DIVISI', 'AMJ', 'AGAMA', 'PENDIDIKAN', 'HP', 
        'EMAIL PRIBADI', 'EMAIL KANTOR', 'ALAMAT', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'FOTO'
    ];
    
    const newSheet = XLSX.utils.json_to_sheet(updatedData, { header: EXCEL_COLUMNS });
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
    
    // Tulis atomik: tulis ke temp file dulu, lalu rename
    const tmpFile = DATA_FILE + '.tmp';
    XLSX.writeFile(newWorkbook, tmpFile);
    fs.renameSync(tmpFile, DATA_FILE);
    
    console.log('[migrate] ✓ File data.xlsx berhasil diupdate');
    console.log('[migrate] ✅ Migrasi selesai!');
    console.log('');
    console.log('Langkah selanjutnya:');
    console.log('1. Verifikasi data.xlsx dengan membukanya di Excel');
    console.log('2. Jalankan: npm run validate');
    console.log('3. Bila ada masalah, restore dari:', backupFile);
}

main();
