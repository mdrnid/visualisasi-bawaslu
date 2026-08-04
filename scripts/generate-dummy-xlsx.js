import XLSX from 'xlsx';
import { writeFileSync, readFileSync } from 'fs';

// Lists for generating realistic Indonesian dummy data
const PROVINCES = [
    'SULAWESI SELATAN', 'BALI', 'DKI JAKARTA', 'JAWA BARAT', 'JAWA TIMUR', 
    'JAWA TENGAH', 'SUMATERA UTARA', 'SUMATERA BARAT', 'BANTEN', 'DI YOGYAKARTA'
];

const KABKOTA_BY_PROV = {
    'SULAWESI SELATAN': ['BANTAENG', 'MAKASSAR', 'GOWA', 'MAROS', 'PANGKEP', 'BARRU', 'LUWU', 'PALOPO', 'SOPPENG', 'SINJAI', 'PINRANG', 'TAKALAR'],
    'BALI': ['DENPASAR', 'BADUNG', 'GIANYAR', 'BULELENG', 'TABANAN', 'KLUNGKUNG', 'KARANGASEM'],
    'DKI JAKARTA': ['JAKARTA PUSAT', 'JAKARTA SELATAN', 'JAKARTA TIMUR', 'JAKARTA BARAT', 'JAKARTA UTARA'],
    'JAWA BARAT': ['BANDUNG', 'BEKASI', 'BOGOR', 'DEPOK', 'CIREBON', 'SUKABUMI', 'KARAWANG', 'PURWAKARTA'],
    'JAWA TIMUR': ['SURABAYA', 'MALANG', 'SIDOARJO', 'GRESIK', 'BANYUWANGI', 'JEMBER', 'KEDIRI'],
    'JAWA TENGAH': ['SEMARANG', 'SURAKARTA', 'MAGELANG', 'TEGAL', 'BANYUMAS', 'CILACAP'],
    'SUMATERA UTARA': ['MEDAN', 'DELI SERDANG', 'SIMALUNGUN', 'LANGKAT', 'KARO', 'ASAHAN'],
    'SUMATERA BARAT': ['PADANG', 'BUKITTINGGI', 'PAYAKUMBUH', 'SOLOK', 'PARIAMAN'],
    'BANTEN': ['TANGERANG', 'SERANG', 'CILEGON', 'PANDEGLANG', 'LEBAK'],
    'DI YOGYAKARTA': ['YOGYAKARTA', 'SLEMAN', 'BANTUL', 'GUNUNGKIDUL', 'KULON PROGO']
};

const MALE_NAMES = [
    'Ahmad', 'Budi', 'Chandra', 'Dedi', 'Eko', 'Fajar', 'Gunawan', 'Hendra', 'Iwan', 'Joko',
    'Kurniawan', 'Lukman', 'Mulyono', 'Nugroho', 'Oki', 'Prabowo', 'Rian', 'Setyawan', 'Taufik', 'Wahyu',
    'Yudi', 'Zainal', 'Aditya', 'Bagus', 'Dwi', 'Hadi', 'Indra', 'Riza', 'Rudi', 'Slamet'
];

const FEMALE_NAMES = [
    'Annisa', 'Bunga', 'Citra', 'Dewi', 'Endah', 'Fitri', 'Gita', 'Hesti', 'Indah', 'Juli',
    'Kartika', 'Laras', 'Mega', 'Ningsih', 'Olla', 'Putri', 'Ratih', 'Sari', 'Tari', 'Wulan',
    'Yanti', 'Zahra', 'Ayu', 'Diah', 'Eka', 'Ika', 'Lia', 'Maya', 'Rina', 'Sri'
];

const LAST_NAMES = [
    'Saputra', 'Wijaya', 'Lestari', 'Utami', 'Pratama', 'Hidayat', 'Kusuma', 'Santoso', 'Sari', 'Putra',
    'Siregar', 'Ginting', 'Nasution', 'Harahap', 'Purba', 'Simanjuntak', 'Sitompul', 'Manurung', 'Lubis',
    'Situmorang', 'Tanjung', 'Chaniago', 'Piliang', 'Sumbayak', 'Sitorus', 'Pane', 'Batubara', 'Rambe'
];

const JABATAN_LIST = ['KETUA', 'ANGGOTA', 'KOORDINATOR', 'STAFF', 'SEKRETARIS', 'BENDAHARA'];
const DIVISI_LIST = [
    'Sumber Daya Manusia Organisasi, Diklat, Datin',
    'Penanganan Pelanggaran & Penyelesaian Sengketa',
    'Pencegahan, Partisipasi Masyarakat & Humas',
    'Hukum dan Penyelesaian Sengketa'
];
const WAKORDIV_LIST = [
    'Penanganan Pelanggaran & Penyelesaian Sengketa',
    'Pencegahan, Partisipasi Masyarakat & Humas',
    'Hukum dan Penyelesaian Sengketa',
    '-'
];

const AGAMA_LIST = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'];
const PENDIDIKAN_LIST = ['S.1', 'S.2', 'S.3', 'SMA', 'D.III', 'D.IV'];
const TAHUN_AMJ = ['2023 - 2028', '2024 - 2029', '2022 - 2027'];

function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRow(no) {
    const prov = rand(PROVINCES);
    const kab = rand(KABKOTA_BY_PROV[prov]);
    const gender = Math.random() > 0.5 ? 'L' : 'P';
    const first = rand(gender === 'L' ? MALE_NAMES : FEMALE_NAMES);
    const last = rand(LAST_NAMES);
    const nama = `${first} ${last}, S.H.`;
    const emailPrefix = `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(Math.random() * 100)}`;
    const hp = '08' + Array.from({length: 10}, () => Math.floor(Math.random() * 10)).join('');
    
    return [
        no,
        prov,
        kab,
        nama,
        gender,
        rand(DIVISI_LIST),
        rand(JABATAN_LIST),
        rand(TAHUN_AMJ),
        rand(WAKORDIV_LIST),
        `${kab}, ${Math.floor(Math.random() * 28) + 1} MEI ${1975 + Math.floor(Math.random() * 25)}`,
        rand(AGAMA_LIST),
        rand(PENDIDIKAN_LIST),
        hp,
        `${emailPrefix}@gmail.com`,
        `set.${kab.toLowerCase().replace(/\s+/g, '')}@bawaslu.go.id`,
        `Bawaslu ${first} ${last}`,
        `@bawaslu_${emailPrefix}`,
        `http://${kab.toLowerCase().replace(/\s+/g, '')}.bawaslu.go.id/`,
        `Jl. Pahlawan No. ${Math.floor(Math.random() * 100) + 1}, ${kab}`,
        `Jl. Keadilan No. ${Math.floor(Math.random() * 200) + 1}, ${kab}`
    ];
}

// Read template file to copy its structures/styles/sheet names
const wbTemplate = XLSX.read(readFileSync('data/data.xlsx'));
const sheetName = wbTemplate.SheetNames[0];
const originalSheet = wbTemplate.Sheets[sheetName];
const originalRows = XLSX.utils.sheet_to_json(originalSheet, { header: 1 });

const headerRow0 = originalRows[0];
const headerRow1 = originalRows[1];

// Generate 1500 records
const finalRows = [headerRow0, headerRow1];
for (let i = 1; i <= 1500; i++) {
    finalRows.push(generateRow(i));
}

const newSheet = XLSX.utils.aoa_to_sheet(finalRows);

// Preserve merge configuration (crucial for social media headers!)
if (originalSheet['!merges']) {
    newSheet['!merges'] = originalSheet['!merges'];
}

const newWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(newWb, newSheet, sheetName);

XLSX.writeFile(newWb, 'data/data.xlsx');
console.log('Successfully generated 1500 dummy records in data/data.xlsx!');
