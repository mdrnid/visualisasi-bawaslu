import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { slugify, stripNameTitles } from '../assets/js/text-utils.js';

const DATA_FILE = path.resolve('data/data.xlsx');
const AWARDS_FILE = path.resolve('data/penghargaan.json');
const PHOTO_DIR = path.resolve('assets/personel');
const AWARDS_DIR = path.resolve('assets/awards');

const wb = XLSX.readFile(DATA_FILE, { cellDates: true, raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

const headers = grid[0];
const rows = grid.slice(1);

const qualityReport = {
    totalRows: rows.length,
    duplicateNames: [],
    genderIssues: [],
    amjValues: [],
    emailIssues: [],
    phoneIssues: [],
    personnelWithoutPhoto: [],
    photoFileNotFound: [],
    orphanPhotos: [],
    orphanAwards: [],
    orphanProofFiles: [],
    missingRequired: [],
};

// 1. Per-row validation
const nameMap = new Map();
const photoFilesOnDisk = new Set(
    fs.existsSync(PHOTO_DIR)
        ? fs.readdirSync(PHOTO_DIR).filter(f => f !== 'index.json' && !fs.statSync(path.join(PHOTO_DIR, f)).isDirectory())
        : []
);
const referencedPhotos = new Set();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

rows.forEach((row, idx) => {
    const rowNum = idx + 2; // Excel row
    const [
        provinsi, kabkota, nama, gender, jabatan,
        wakordiv, divisi, amj, agama, pendidikan,
        hp, emailP, emailK, alamat, facebook,
        instagram, website, foto
    ] = row.map(v => (v === undefined || v === null) ? '' : String(v).trim());

    // Nama check
    if (!nama) {
        qualityReport.missingRequired.push({ row: rowNum, field: 'NAMA' });
    } else {
        const cleanName = nama.toLowerCase();
        if (nameMap.has(cleanName)) {
            qualityReport.duplicateNames.push({ row: rowNum, previousRow: nameMap.get(cleanName), nama });
        } else {
            nameMap.set(cleanName, rowNum);
        }
    }

    // Gender check
    const gLower = gender.toLowerCase();
    const isL = gLower === 'l' || gLower === 'laki-laki' || gLower === 'pria' || gLower === 'male';
    const isP = gLower === 'p' || gLower === 'perempuan' || gLower === 'wanita' || gLower === 'female';
    if (!isL && !isP) {
        qualityReport.genderIssues.push({ row: rowNum, nama, gender });
    }

    // AMJ check
    qualityReport.amjValues.push({ row: rowNum, nama, amj });

    // Email check
    if (emailP && !EMAIL_RE.test(emailP)) {
        qualityReport.emailIssues.push({ row: rowNum, nama, type: 'Pribadi', email: emailP });
    }
    if (emailK) {
        // Kantor email could be multiple or single
        const parts = emailK.split(/[\s\-\/;,]+/).map(e => e.trim()).filter(Boolean);
        const invalid = parts.filter(e => !EMAIL_RE.test(e));
        if (invalid.length > 0) {
            qualityReport.emailIssues.push({ row: rowNum, nama, type: 'Kantor', email: emailK, invalidParts: invalid });
        }
    }

    // Phone check
    const cleanHp = hp.replace(/\D/g, '');
    if (!cleanHp) {
        qualityReport.phoneIssues.push({ row: rowNum, nama, hp, issue: 'Kosong/tanpa digit' });
    } else if (cleanHp.length < 9 || cleanHp.length > 15) {
        qualityReport.phoneIssues.push({ row: rowNum, nama, hp, issue: `Panjang tidak biasa (${cleanHp.length} digit)` });
    }

    // Photo check
    if (!foto) {
        qualityReport.personnelWithoutPhoto.push({ row: rowNum, nama, issue: 'Kolom FOTO kosong' });
    } else {
        const photoBasename = path.basename(foto);
        referencedPhotos.add(photoBasename);
        const fullPhotoPath = path.resolve(foto);
        if (!fs.existsSync(fullPhotoPath)) {
            // Cek juga di PHOTO_DIR
            const altPath = path.join(PHOTO_DIR, photoBasename);
            if (!fs.existsSync(altPath)) {
                qualityReport.photoFileNotFound.push({ row: rowNum, nama, fotoPath: foto, basename: photoBasename });
            }
        }
    }
});

// Orphan photos
for (const p of photoFilesOnDisk) {
    if (!referencedPhotos.has(p)) {
        qualityReport.orphanPhotos.push(p);
    }
}

// 2. Awards analysis
const awards = JSON.parse(fs.readFileSync(AWARDS_FILE, 'utf-8'));
const referencedProofs = new Set();

function listAllProofFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        if (item.name === 'index.json') continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            files = files.concat(listAllProofFiles(full));
        } else {
            files.push(path.relative(AWARDS_DIR, full).replace(/\\/g, '/'));
        }
    }
    return files;
}

const proofFilesOnDisk = new Set(listAllProofFiles(AWARDS_DIR));

// Matching awards to personnel
// Kita gunakan logika pencocokan dari awards.js untuk melihat apakah cocok
function regionKey(value) {
    return slugify(String(value ?? '').replace(/^\s*(kabupaten|kota administrasi|kota|kab\.?)\s+/i, ''));
}
function nameKey(value) {
    return slugify(stripNameTitles(value));
}

const personnelKeys = new Map();
rows.forEach((row, idx) => {
    const kabkota = String(row[1] || '').trim();
    const nama = String(row[2] || '').trim();
    const pKey = regionKey(kabkota) + '|' + nameKey(nama);
    const nKey = nameKey(nama);
    personnelKeys.set(pKey, { rowNum: idx + 2, kabkota, nama });
    if (!personnelKeys.has(nKey)) {
        personnelKeys.set(nKey, { rowNum: idx + 2, kabkota, nama });
    }
});

awards.forEach((award, idx) => {
    const aKab = award.kabkota || award['Kab/Kota'] || '';
    const aNama = award.nama || award.Nama || '';
    const fullKey = regionKey(aKab) + '|' + nameKey(aNama);
    const nKey = nameKey(aNama);

    let matched = personnelKeys.get(fullKey) || personnelKeys.get(nKey);
    if (!matched) {
        qualityReport.orphanAwards.push({
            awardIndex: idx + 1,
            nama: aNama,
            kabkota: aKab,
            penghargaan: award.penghargaan
        });
    }

    if (award.bukti) {
        const buktiClean = award.bukti.replace(/^assets\/awards\//, '').replace(/\\/g, '/');
        referencedProofs.add(buktiClean);
        const fullProofPath = path.resolve(award.bukti);
        if (!fs.existsSync(fullProofPath)) {
            // periksa di AWARDS_DIR
            const altPath = path.join(AWARDS_DIR, buktiClean);
            if (!fs.existsSync(altPath)) {
                qualityReport.orphanAwards.push({
                    awardIndex: idx + 1,
                    nama: aNama,
                    issue: 'Bukti file not found: ' + award.bukti
                });
            }
        }
    }
});

for (const pr of proofFilesOnDisk) {
    if (!referencedProofs.has(pr)) {
        qualityReport.orphanProofFiles.push(pr);
    }
}

console.log(JSON.stringify(qualityReport, null, 2));
