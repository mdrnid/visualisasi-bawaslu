#!/usr/bin/env node
/**
 * Pemeriksa kualitas data di terminal.
 *   node scripts/validate-data.mjs [path/ke/file.xlsx]
 * Keluar dengan kode 1 bila ditemukan kesalahan (bukan sekadar peringatan).
 */
import { readFileSync, existsSync } from 'node:fs';
import XLSX from 'xlsx';

const file = process.argv[2] || 'data/personel.xlsx';
if (!existsSync(file)) {
    console.error('Berkas tidak ditemukan: ' + file);
    process.exit(1);
}

const slug = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const REQUIRED = ['NAMA', 'PROVINSI'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const wb = XLSX.read(readFileSync(file));
const sheet = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });

let headerIndex = 0, best = -1;
for (let i = 0; i < Math.min(grid.length, 12); i += 1) {
    const score = grid[i].filter((c) => REQUIRED.includes(slug(c))).length;
    if (score > best) { best = score; headerIndex = i; }
}
const headers = grid[headerIndex].map(slug);
const idx = (name) => headers.indexOf(name);

const errors = [];
const warnings = [];
for (const name of REQUIRED) {
    if (idx(name) === -1) errors.push('Kolom wajib tidak ditemukan: ' + name);
}

const seenPhone = new Map();
for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i];
    const at = (name) => (idx(name) === -1 ? '' : String(row[idx(name)] ?? '').trim());
    if (!row.some((c) => String(c ?? '').trim())) continue;

    const nama = at('NAMA');
    if (!nama) { errors.push('Baris ' + (i + 1) + ': NAMA kosong'); continue; }
    if (!at('PROVINSI')) errors.push('Baris ' + (i + 1) + ' (' + nama + '): PROVINSI kosong');

    for (const col of headers.filter((h) => h.includes('MAIL'))) {
        const v = at(col);
        if (v && !EMAIL_RE.test(v)) errors.push('Baris ' + (i + 1) + ' (' + nama + '): e-mail tidak valid → ' + v);
    }

    const phoneCol = headers.find((h) => h.includes('HP') || h.includes('WHATSAPP'));
    const phone = phoneCol ? at(phoneCol).replace(/\D/g, '') : '';
    if (phone) {
        if (phone.length < 9 || phone.length > 15) warnings.push('Baris ' + (i + 1) + ' (' + nama + '): panjang nomor janggal → ' + phone);
        if (seenPhone.has(phone)) warnings.push('Baris ' + (i + 1) + ' (' + nama + '): nomor duplikat dengan baris ' + seenPhone.get(phone));
        else seenPhone.set(phone, i + 1);
    } else {
        warnings.push('Baris ' + (i + 1) + ' (' + nama + '): tidak ada nomor kontak');
    }
}

console.log('Berkas    : ' + file);
console.log('Sheet     : ' + wb.SheetNames[0]);
console.log('Header    : baris ' + (headerIndex + 1));
console.log('Data      : ' + Math.max(0, grid.length - headerIndex - 1) + ' baris');
console.log('Kesalahan : ' + errors.length);
console.log('Peringatan: ' + warnings.length + '\n');
errors.slice(0, 50).forEach((e) => console.log('  [ERROR] ' + e));
warnings.slice(0, 50).forEach((w) => console.log('  [WARN ] ' + w));

process.exit(errors.length ? 1 : 0);