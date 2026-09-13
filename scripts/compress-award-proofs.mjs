#!/usr/bin/env node
/**
 * Kompres semua berkas PDF dan gambar sertifikat/bukti penghargaan di assets/awards/
 * Menjimpan backup file asli di assets/awards/_originals/
 * Jalankan: npm run awards:compress
 */
import { readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compressProofBuffer } from '../utils/compressor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AWARDS_DIR = path.join(ROOT, 'assets', 'awards');
const BACKUP_DIR = path.join(AWARDS_DIR, '_originals');

mkdirSync(BACKUP_DIR, { recursive: true });

function walk(dir) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === '_originals') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walk(full));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                results.push(full);
            }
        }
    }
    return results;
}

async function main() {
    const files = walk(AWARDS_DIR);
    if (files.length === 0) {
        console.log('Tidak ada berkas bukti penghargaan yang ditemukan.');
        return;
    }

    console.log(`\n======================================================`);
    console.log(`  MEMPROSES KOMPRESI ${files.length} BERKAS BUKTI PENGHARGAAN`);
    console.log(`======================================================\n`);

    let totalInBytes = 0;
    let totalOutBytes = 0;

    for (const filePath of files) {
        const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
        const fileName = path.basename(filePath);

        // Buat path backup di _originals dengan mempertahankan struktur folder relatif
        const relFromAwards = path.relative(AWARDS_DIR, filePath);
        const backupPath = path.join(BACKUP_DIR, relFromAwards);
        mkdirSync(path.dirname(backupPath), { recursive: true });

        // Simpan backup file asli jika belum ada
        if (!existsSync(backupPath)) {
            copyFileSync(filePath, backupPath);
        }

        const inputBuffer = readFileSync(backupPath);
        const inSize = inputBuffer.length;
        totalInBytes += inSize;

        const compressedBuffer = await compressProofBuffer(inputBuffer, fileName);
        const outSize = compressedBuffer.length;
        totalOutBytes += outSize;

        writeFileSync(filePath, compressedBuffer);

        const savedPercent = ((1 - outSize / inSize) * 100).toFixed(1);
        console.log(`✓ ${fileName}`);
        console.log(`  Path : ${relPath}`);
        console.log(`  Size : ${(inSize / 1024).toFixed(1)} KB → ${(outSize / 1024).toFixed(1)} KB (-${savedPercent}%)\n`);
    }

    const totalSavedMB = ((totalInBytes - totalOutBytes) / 1024 / 1024).toFixed(2);
    const totalSavedPercent = ((1 - totalOutBytes / totalInBytes) * 100).toFixed(1);

    console.log(`======================================================`);
    console.log(`  RINGKASAN HASIL KOMPRESI BUKTI PENGHARGAAN`);
    console.log(`======================================================`);
    console.log(`  Ukuran Awal   : ${(totalInBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Ukuran Akhir  : ${(totalOutBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total Hemat   : ${totalSavedMB} MB (-${totalSavedPercent}%)`);
    console.log(`  File Asli     : Tersimpan di assets/awards/_originals/`);
    console.log(`======================================================\n`);
}

main().catch(err => {
    console.error('Terjadi kesalahan saat kompresi:', err);
    process.exit(1);
});
