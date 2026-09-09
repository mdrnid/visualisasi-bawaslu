/**
 * scripts/import-xlsx.mjs
 * 
 * Script import data dari data/data.xlsx dan data/penghargaan.json ke Supabase Postgres (schema api).
 * Usage:
 *   node scripts/import-xlsx.mjs            (--dry-run default)
 *   node scripts/import-xlsx.mjs --commit   (benar-benar menulis ke Postgres)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';
import { slugify, stripNameTitles } from '../assets/js/text-utils.js';

const isCommit = process.argv.includes('--commit');
const isDryRun = !isCommit;

const DATA_FILE = path.resolve('data/data.xlsx');
const AWARDS_FILE = path.resolve('data/penghargaan.json');
const ID_MAP_FILE = path.resolve('reports/id-map.json');
const SUMMARY_FILE = path.resolve('reports/import-summary.md');

console.log('====================================================');
console.log(`IMPORT DATA EXCEL -> SUPABASE (${isCommit ? 'COMMIT MODE' : 'DRY-RUN MODE'})`);
console.log('====================================================');

if (isCommit && !isDbConfigured()) {
    console.error('FATAL: Database belum dikonfigurasi. Mohon isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env');
    process.exit(1);
}

// 1. Baca id-map lama jika ada (idempoten)
let idMap = {};
if (fs.existsSync(ID_MAP_FILE)) {
    try {
        idMap = JSON.parse(fs.readFileSync(ID_MAP_FILE, 'utf-8'));
    } catch (_) {
        idMap = {};
    }
}

// 2. Baca data.xlsx
if (!fs.existsSync(DATA_FILE)) {
    console.error('FATAL: data/data.xlsx tidak ditemukan.');
    process.exit(1);
}

const wb = XLSX.readFile(DATA_FILE, { cellDates: true, raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

if (grid.length < 2) {
    console.error('FATAL: data/data.xlsx tidak memiliki data.');
    process.exit(1);
}

const headers = grid[0];
const rows = grid.slice(1);

const stats = {
    totalPersonnelRows: rows.length,
    personnelInserted: 0,
    personnelUpdated: 0,
    personnelSkipped: 0,
    personnelFailed: 0,
    awardsTotal: 0,
    awardsInserted: 0,
    awardsUpdated: 0,
    awardsOrphan: 0,
    failedRows: [],
    anomalies: [],
};

// Normalizer yang diizinkan:
// - trim spasi
// - gender -> 'L' / 'P'
// - tanggal -> ISO (YYYY-MM-DD)
// - email -> lowercase + trim
function normGender(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'l' || s === 'laki-laki' || s === 'pria' || s === 'male' || s === 'lk') return 'L';
    if (s === 'p' || s === 'perempuan' || s === 'wanita' || s === 'female' || s === 'pr') return 'P';
    return null;
}

function parseAmjDates(amjStr) {
    const raw = String(amjStr ?? '').trim();
    if (!raw) return { term_start: null, term_end: null, term_raw: '' };

    // Format ISO date langsung YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { term_start: null, term_end: raw, term_raw: raw };
    }

    // Format "2023 - 2028" atau "2023-2028"
    const m = raw.match(/(\d{4})\s*[-–]\s*(\d{4})/);
    if (m) {
        return {
            term_start: `${m[1]}-01-01`,
            term_end: `${m[2]}-12-31`,
            term_raw: raw,
        };
    }

    return { term_start: null, term_end: null, term_raw: raw };
}

// 3. Proses Personnel
const personnelRecords = [];
const nameToIdMap = new Map(); // Untuk pencocokan awards

rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const [
        provinsi, kabkota, nama, gender, jabatan,
        wakordiv, divisi, amj, agama, pendidikan,
        hp, emailP, emailK, alamat, facebook,
        instagram, website, foto
    ] = row.map(v => (v === undefined || v === null) ? '' : String(v).trim());

    if (!nama) {
        stats.failedRows.push({ row: rowNum, reason: 'Nama kosong' });
        stats.personnelFailed++;
        return;
    }

    const cleanGender = normGender(gender);
    if (!cleanGender) {
        stats.anomalies.push({ row: rowNum, nama, field: 'gender', value: gender, note: 'Nilai gender tidak valid' });
    }

    const amjParsed = parseAmjDates(amj);

    // Code & ID generation
    const personnelCode = `PRS-${String(idx + 1).padStart(4, '0')}`;
    const mapKey = `${personnelCode}::${nama.toLowerCase()}`;
    
    // Gunakan id lama dari idMap jika ada, atau generate UUID stabil v4
    let id = idMap[mapKey];
    if (!id) {
        id = crypto.randomUUID();
        idMap[mapKey] = id;
    }

    // Simpan juga ke alias map
    const strippedName = slugify(stripNameTitles(nama));
    const regKey = slugify(kabkota.replace(/^\s*(kabupaten|kota administrasi|kota|kab\.?)\s+/i, ''));
    nameToIdMap.set(`${regKey}|${strippedName}`, id);
    nameToIdMap.set(strippedName, id);

    const record = {
        id,
        personnel_code: personnelCode,
        province: provinsi || null,
        district: kabkota || null,
        name: nama,
        gender: cleanGender,
        position: jabatan || null,
        wakordiv: wakordiv || null,
        division: divisi || null,
        term_start: amjParsed.term_start,
        term_end: amjParsed.term_end,
        term_raw: amjParsed.term_raw || null,
        religion: agama || null,
        education: pendidikan || null,
        phone: hp || null,
        private_email: emailP ? emailP.toLowerCase() : null,
        office_email: emailK ? emailK.toLowerCase() : null,
        office_address: alamat || null,
        facebook: facebook || null,
        instagram: instagram || null,
        website: website || null,
        photo_local_path: foto || null,
        photo_object_path: null,
        photo_is_public: false,
        is_published: false,
        version: 1,
    };

    personnelRecords.push(record);
});

// Alias khusus hasil temuan Fase 0:
// "Dr. Kamridah Habe, S.Pd.I., M.Pd" -> cocokan ke Dr. Kamridah di Kabupaten Bone
const kamridahId = nameToIdMap.get('bone|kamridah') || nameToIdMap.get('kamridah');
if (kamridahId) {
    nameToIdMap.set('bone|kamridah-habe', kamridahId);
    nameToIdMap.set('kamridah-habe', kamridahId);
}

// 4. Proses Awards
const awardRecords = [];
let rawAwards = [];
if (fs.existsSync(AWARDS_FILE)) {
    try {
        rawAwards = JSON.parse(fs.readFileSync(AWARDS_FILE, 'utf-8'));
    } catch (e) {
        console.warn('Gagal membaca penghargaan.json:', e.message);
    }
}
stats.awardsTotal = rawAwards.length;

rawAwards.forEach((aw, idx) => {
    const kab = String(aw.kabkota || aw['Kab/Kota'] || '').trim();
    const nama = String(aw.nama || aw.Nama || '').trim();
    const regKey = slugify(kab.replace(/^\s*(kabupaten|kota administrasi|kota|kab\.?)\s+/i, ''));
    const strippedName = slugify(stripNameTitles(nama));

    const personnelId = nameToIdMap.get(`${regKey}|${strippedName}`) || nameToIdMap.get(strippedName);

    if (!personnelId) {
        stats.awardsOrphan++;
        stats.anomalies.push({
            awardIndex: idx + 1,
            nama,
            kab,
            penghargaan: aw.penghargaan,
            note: 'Penghargaan orphan: tidak ditemukan personel yang cocok',
        });
        return;
    }

    const awardMapKey = `AWARD::${personnelId}::${slugify(aw.penghargaan)}`;
    let awardId = idMap[awardMapKey];
    if (!awardId) {
        awardId = crypto.randomUUID();
        idMap[awardMapKey] = awardId;
    }

    awardRecords.push({
        id: awardId,
        personnel_id: personnelId,
        title: String(aw.penghargaan || '').trim(),
        category: String(aw.kategori || '').trim() || null,
        issuer: String(aw.issuer || aw.pemberi || '').trim() || null,
        awarded_on: null,
        proof_local_path: String(aw.bukti || '').trim() || null,
        is_published: false,
    });
});

console.log(`\nValidasi data selesai:`);
console.log(`- Personnel diproses : ${personnelRecords.length} / ${rows.length}`);
console.log(`- Awards diproses    : ${awardRecords.length} / ${rawAwards.length}`);
console.log(`- Anomali / Catatan  : ${stats.anomalies.length}`);

// 5. Commit ke Database (Bila --commit)
async function executeCommit() {
    console.log('\nMenulis data ke Postgres Supabase (schema: api)...');
    
    // Upsert Personnel
    for (const p of personnelRecords) {
        const { error } = await supabaseAdmin
            .from('personnel')
            .upsert(p, { onConflict: 'personnel_code' });
        
        if (error) {
            console.error(`Gagal upsert personnel ${p.personnel_code} (${p.name}):`, error.message);
            stats.personnelFailed++;
        } else {
            stats.personnelInserted++;
        }
    }

    // Upsert Awards
    for (const a of awardRecords) {
        const { error } = await supabaseAdmin
            .from('awards')
            .upsert(a, { onConflict: 'id' });
        
        if (error) {
            console.error(`Gagal upsert award ${a.title}:`, error.message);
        } else {
            stats.awardsInserted++;
        }
    }
}

if (isCommit) {
    await executeCommit();
} else {
    stats.personnelInserted = personnelRecords.length;
    stats.awardsInserted = awardRecords.length;
    console.log('[DRY-RUN] Tidak ada penulisan ke database. Jalankan dengan --commit untuk menerapkan.');
}

// 6. Simpan id-map
fs.mkdirSync(path.dirname(ID_MAP_FILE), { recursive: true });
fs.writeFileSync(ID_MAP_FILE, JSON.stringify(idMap, null, 2), 'utf-8');
console.log(`\nID map tersimpan di: ${ID_MAP_FILE}`);

// 7. Tulis Summary
const summaryContent = `# Ringkasan Migrasi Data (${isCommit ? 'COMMIT' : 'DRY-RUN'})

Tanggal Eksekusi: ${new Date().toISOString()}
Mode: ${isCommit ? 'Commit (Menulis ke DB)' : 'Dry-Run (Simulasi)'}

## Hasil Statistik
- **Total Baris Personel di Excel:** ${stats.totalPersonnelRows}
- **Personel Sukses Dipetakan:** ${personnelRecords.length}
- **Personel Gagal:** ${stats.personnelFailed}
- **Total Penghargaan di JSON:** ${stats.awardsTotal}
- **Penghargaan Sukses Dicocokkan (FK):** ${awardRecords.length}
- **Penghargaan Orphan:** ${stats.awardsOrphan}

## Catatan Anomali & Resolusi
${stats.anomalies.length === 0 ? '- Tidak ada anomali.' : stats.anomalies.map(a => `- **${a.nama || 'Item #' + a.awardIndex}:** ${a.note || a.field} (${JSON.stringify(a)})`).join('\n')}

## Status Idempoten
Pemetaan ID stabil disimpan di \`reports/id-map.json\` berisi ${Object.keys(idMap).length} entri (personnel + awards).
`;

fs.writeFileSync(SUMMARY_FILE, summaryContent, 'utf-8');
console.log(`Laporan summary tersimpan di: ${SUMMARY_FILE}`);
