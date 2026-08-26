#!/usr/bin/env node
/** Konversi sheet PENGHARGAAN pada data/data.xlsx menjadi data/penghargaan.json. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

const SRC = path.resolve('data/data.xlsx');
const OUT = path.resolve('data/penghargaan.json');
const SHEET = 'PENGHARGAAN';

const FIELD_BY_HEADER = [
    [/kab\s*\/?\s*kota|kabupaten/i, 'kabkota'],
    [/^nama/i, 'nama'],
    [/jabatan/i, 'jabatan'],
    [/ko?ordinator\s*divisi|kordiv/i, 'kordiv'],
    [/wakordiv|wakil\s*koordinator/i, 'wakordiv'],
    [/penghargaan|prestasi/i, 'penghargaan'],
    [/link|bukti|url/i, 'bukti'],
];

const field = (header) => FIELD_BY_HEADER.find(([re]) => re.test(header))?.[1] ?? null;

const wb = xlsx.readFile(SRC);
const sheet = wb.Sheets[SHEET];
if (!sheet) {
    console.error(`Sheet "${SHEET}" tidak ditemukan di ${SRC}.`);
    process.exit(1);
}

const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' }).map((row) => {
    const out = {};
    for (const [header, value] of Object.entries(row)) {
        const key = field(String(header).trim());
        if (key) out[key] = String(value).trim();
    }
    return out;
});

const data = rows.filter((r) => r.nama && r.penghargaan);
writeFileSync(OUT, JSON.stringify(data, null, 4) + '\n', 'utf8');
console.log(`${data.length} penghargaan ditulis ke ${path.relative(process.cwd(), OUT)}.`);
