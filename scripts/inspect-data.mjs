import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const DATA_FILE = path.resolve('data/data.xlsx');
const AWARDS_FILE = path.resolve('data/penghargaan.json');
const PHOTO_DIR = path.resolve('assets/personel');
const AWARDS_DIR = path.resolve('assets/awards');

const wb = XLSX.readFile(DATA_FILE, { cellDates: true, raw: true });
console.log('Sheet Names:', wb.SheetNames);
const sheet = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

console.log('Total grid rows in data.xlsx:', grid.length);
console.log('Header row (index 0):', JSON.stringify(grid[0], null, 2));

const headers = grid[0];
const dataRows = grid.slice(1);

console.log('Total data rows:', dataRows.length);

// Column values analysis
const colStats = headers.map((h, colIdx) => {
    let emptyCount = 0;
    let distinctValues = new Set();
    let samples = [];
    dataRows.forEach((row, rowIdx) => {
        const val = row[colIdx];
        if (val === undefined || val === null || String(val).trim() === '') {
            emptyCount++;
        } else {
            distinctValues.add(String(val).trim());
            if (samples.length < 5) samples.push(val);
        }
    });
    return {
        header: h,
        colIdx,
        emptyCount,
        distinctCount: distinctValues.size,
        samples
    };
});

console.log('\n--- COLUMN STATS ---');
console.log(JSON.stringify(colStats, null, 2));

// Check awards.json
console.log('\n--- AWARDS FILE ANALYSIS ---');
const awards = JSON.parse(fs.readFileSync(AWARDS_FILE, 'utf-8'));
console.log('Total awards in penghargaan.json:', awards.length);
if (awards.length > 0) {
    console.log('First 3 awards samples:', JSON.stringify(awards.slice(0, 3), null, 2));
    const awardKeys = Object.keys(awards[0]);
    console.log('Award keys:', awardKeys);
}

// Check photos on disk
console.log('\n--- PHOTO ASSETS ---');
const photoFiles = fs.readdirSync(PHOTO_DIR).filter(f => f !== 'index.json');
console.log('Total files in assets/personel:', photoFiles.length);

// Check proof assets on disk
console.log('\n--- AWARDS ASSETS ---');
function listFilesRec(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
        if (item.name === 'index.json') continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            results = results.concat(listFilesRec(full));
        } else {
            results.push(path.relative(AWARDS_DIR, full));
        }
    }
    return results;
}
const proofFiles = listFilesRec(AWARDS_DIR);
console.log('Total proof files in assets/awards:', proofFiles.length);
