#!/usr/bin/env node
/**
 * Pemeriksa kualitas data di terminal.
 *   node scripts/validate-data.mjs [path/ke/file.xlsx]
 * Keluar dengan kode 1 bila ditemukan kesalahan (bukan sekadar peringatan).
 */
import { readFileSync, existsSync } from 'node:fs';
import XLSX from 'xlsx';
import { headerScore, mapHeader, normalizeRecord, validateRecord, findDuplicates } from '../assets/js/schema.js';

const file = process.argv[2] || 'data/data.xlsx';
if (!existsSync(file)) {
    console.error('Berkas tidak ditemukan: ' + file);
    process.exit(1);
}

const wb = XLSX.read(readFileSync(file));
const sheet = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });

if (!grid.length) {
    console.error('Sheet kosong.');
    process.exit(1);
}

// Find header row using headerScore from schema
let headerIndex = 0,
    best = -1;
for (let i = 0; i < Math.min(grid.length, 12); i += 1) {
    const score = headerScore(grid[i]);
    if (score > best) {
        best = score;
        headerIndex = i;
    }
}

const recognizedColumns = grid[headerIndex].map(mapHeader).filter(Boolean).length;
const totalColumns = grid[headerIndex].length;

// Convert raw grid rows to raw objects
const columnMap = grid[headerIndex].map(mapHeader);
const rawRows = [];
for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i];
    const obj = { __row: i + 1 };
    let hasValue = false;
    columnMap.forEach((key, c) => {
        if (!key) return;
        const v = cells[c];
        obj[key] = v;
        if (String(v ?? '').trim() !== '') hasValue = true;
    });
    if (hasValue && String(obj.nama ?? '').trim() !== '') rawRows.push(obj);
}

// Run normalization & validation from schema.js
const records = rawRows.map((raw, i) => normalizeRecord(raw, i));
const issues = [...records.flatMap(validateRecord), ...findDuplicates(records)];

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

console.log('Berkas     : ' + file);
console.log('Sheet      : ' + wb.SheetNames[0]);
console.log('Header     : baris ' + (headerIndex + 1));
console.log('Kolom      : ' + recognizedColumns + '/' + totalColumns + ' dikenali');
console.log('Data       : ' + records.length + ' baris');
console.log('Kesalahan  : ' + errors.length);
console.log('Peringatan : ' + warnings.length + '\n');

errors
    .slice(0, 50)
    .forEach((e) => console.log(`  [ERROR] Baris ${e.rowNumber} (${e.nama}): ${e.field} - ${e.message}`));
warnings
    .slice(0, 50)
    .forEach((w) => console.log(`  [WARN ] Baris ${w.rowNumber} (${w.nama}): ${w.field} - ${w.message}`));

process.exit(errors.length ? 1 : 0);
