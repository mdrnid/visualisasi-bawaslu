#!/usr/bin/env node
/**
 * Kompres semua foto personel ke WebP 800x800 maks, kualitas 75.
 * Jalankan sekali: npm run photos:compress
 * Original disimpan di assets/personel/_originals/ (backup)
 */
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PHOTO_DIR = path.join(ROOT, 'assets', 'personel');
const BACKUP_DIR = path.join(PHOTO_DIR, '_originals');
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP']);
const MAX_DIMENSION = 800;   // px — cukup untuk kartu profil
const QUALITY = 75;          // WebP quality 0-100

mkdirSync(BACKUP_DIR, { recursive: true });

async function compress(filePath) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const outPath = path.join(dir, base + '.webp');

    // Backup original
    const backupPath = path.join(BACKUP_DIR, path.basename(filePath));
    if (!existsSync(backupPath)) {
        renameSync(filePath, backupPath);
    }

    const { width, height, size: inSize } = await sharp(backupPath).metadata();
    const bigger = Math.max(width || 0, height || 0);
    const scale = bigger > MAX_DIMENSION ? MAX_DIMENSION / bigger : 1;

    await sharp(backupPath)
        .resize(
            Math.round((width || MAX_DIMENSION) * scale),
            Math.round((height || MAX_DIMENSION) * scale),
            { fit: 'inside', withoutEnlargement: true }
        )
        .webp({ quality: QUALITY })
        .toFile(outPath);

    const { size: outSize } = statSync(outPath);
    const saved = Math.round((1 - outSize / inSize) * 100);
    return { file: path.relative(ROOT, outPath), inKB: Math.round(inSize / 1024), outKB: Math.round(outSize / 1024), saved };
}

function walk(dir) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === '_originals' || entry.name === 'index.json') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full));
        else if (ALLOWED.has(path.extname(entry.name))) results.push(full);
    }
    return results;
}

const files = walk(PHOTO_DIR).filter(f => !f.includes('_originals'));
if (files.length === 0) {
    console.log('Tidak ada foto yang perlu dikompres.');
    process.exit(0);
}

console.log(`Memproses ${files.length} foto...`);
let totalSavedKB = 0;
for (const f of files) {
    try {
        const r = await compress(f);
        totalSavedKB += r.inKB - r.outKB;
        console.log(`✓ ${r.file}  ${r.inKB}KB → ${r.outKB}KB  (-${r.saved}%)`);
    } catch (err) {
        console.error(`✗ ${f}:`, err.message);
    }
}
console.log(`\nSelesai! Total hemat: ${Math.round(totalSavedKB / 1024 * 10) / 10} MB`);
console.log(`Original tersimpan di: assets/personel/_originals/`);
console.log(`Jalankan 'npm run photos:manifest' untuk memperbarui manifes foto.`);
