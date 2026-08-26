#!/usr/bin/env node
/**
 * Membuat assets/personel/index.json berisi daftar berkas foto yang benar-benar ada.
 * Jalankan setiap kali menambah/menghapus foto:  npm run photos:manifest
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PHOTO_DIR = path.join(ROOT, 'assets', 'personel');
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function walk(dir, prefix = '') {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'index.json') continue;
        const full = path.join(dir, entry);
        const rel = prefix ? prefix + '/' + entry : entry;
        if (statSync(full).isDirectory()) out.push(...walk(full, rel));
        else if (ALLOWED.has(path.extname(entry).toLowerCase())) out.push(rel);
    }
    return out;
}

try {
    const files = walk(PHOTO_DIR).sort((a, b) => a.localeCompare(b, 'id'));
    writeFileSync(path.join(PHOTO_DIR, 'index.json'), JSON.stringify(files, null, 2) + '\n', 'utf8');
    console.log('OK: ' + files.length + ' foto terdaftar di assets/personel/index.json');
} catch (err) {
    console.error('GAGAL membuat manifes foto:', err.message);
    process.exitCode = 1;
}
