#!/usr/bin/env node
/**
 * Membuat assets/awards/index.json berisi daftar berkas bukti penghargaan yang ada.
 * Jalankan setiap kali menambah/menghapus berkas bukti:  npm run awards:manifest
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AWARDS_DIR = path.join(ROOT, 'assets', 'awards');
const ALLOWED = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

function walk(dir, prefix = '') {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'index.json' || entry === 'README.md') continue;
        const full = path.join(dir, entry);
        const rel = prefix ? prefix + '/' + entry : entry;
        if (statSync(full).isDirectory()) out.push(...walk(full, rel));
        else if (ALLOWED.has(path.extname(entry).toLowerCase())) out.push(rel);
    }
    return out;
}

try {
    mkdirSync(AWARDS_DIR, { recursive: true });
    const files = walk(AWARDS_DIR).sort((a, b) => a.localeCompare(b, 'id'));
    writeFileSync(path.join(AWARDS_DIR, 'index.json'), JSON.stringify(files, null, 2) + '\n', 'utf8');
    console.log('OK: ' + files.length + ' berkas bukti terdaftar di assets/awards/index.json');
} catch (err) {
    console.error('GAGAL membuat manifes bukti penghargaan:', err.message);
    process.exitCode = 1;
}
