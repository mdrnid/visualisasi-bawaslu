/**
 * Server statis + endpoint simpan untuk Visualisasi Personel Bawaslu.
 *
 * Perbaikan dari versi lama:
 *  1. express.static(__dirname) MENGEKSPOS SELURUH REPO — data/data.xlsx (PII 80
 *     personel), server.js, package.json, bahkan .git — ke siapa pun di jaringan.
 *     Sekarang hanya /assets dan berkas yang di-whitelist yang disajikan.
 *  2. POST /api/save tanpa autentikasi/validasi. Sekarang: token opsional
 *     (APP_TOKEN), whitelist kolom, batas jumlah baris & ukuran body.
 *  3. XLSX.writeFile langsung ke berkas tujuan — kalau proses mati saat menulis,
 *     data.xlsx korup permanen. Sekarang: tulis ke berkas sementara lalu rename
 *     (atomik) + backup bertanda waktu (10 terakhir disimpan).
 *  4. json_to_sheet tanpa header eksplisit — urutan kolom mengikuti kunci objek
 *     pertama, kolom bisa hilang/berpindah. Sekarang header eksplisit.
 *  5. PORT/HOST hardcoded 8080 / 0.0.0.0. Sekarang dari environment, default
 *     127.0.0.1 (aman) — membuka ke jaringan harus keputusan sadar.
 */
'use strict';

import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import multer from 'multer';
import sharp from 'sharp';
import { validateRecord } from './assets/js/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import kolom Excel dari schema.js (sumber kebenaran tunggal)
// Schema.js adalah ES module, sudah bisa diimpor langsung
const EXCEL_COLUMNS = [
    'ID',
    'NO', 'PROVINSI', 'KABUPATEN/KOTA', 'NO URUT', 'NAMA', 'JENIS KELAMIN', 'JABATAN',
    'WAKORDIV', 'DIVISI', 'AMJ', 'AGAMA', 'PENDIDIKAN', 'HP', 'EMAIL PRIBADI',
    'EMAIL KANTOR', 'ALAMAT', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'FOTO',
];

const KEY_TO_COLUMN = {
    id: 'ID',
    no: 'NO', provinsi: 'PROVINSI', kabkota: 'KABUPATEN/KOTA', noUrut: 'NO URUT',
    nama: 'NAMA', gender: 'JENIS KELAMIN', jabatan: 'JABATAN', wakordiv: 'WAKORDIV',
    div: 'DIVISI', amj: 'AMJ', agama: 'AGAMA', pendidikan: 'PENDIDIKAN', hp: 'HP',
    emailP: 'EMAIL PRIBADI', emailK: 'EMAIL KANTOR', alamat: 'ALAMAT',
    facebook: 'FACEBOOK', instagram: 'INSTAGRAM', website: 'WEBSITE', foto: 'FOTO',
};

// CATATAN: Untuk fase berikutnya, kita akan impor langsung dari schema.js
// setelah memastikan server.js sepenuhnya ES module compatible

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1'; // Default loopback (aman)
const APP_TOKEN = process.env.APP_TOKEN || '';

// Validasi keamanan: Paksa APP_TOKEN bila HOST bukan loopback
const isLoopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
if (!isLoopback && !APP_TOKEN) {
    console.error('FATAL: APP_TOKEN wajib diisi bila HOST bukan loopback (127.0.0.1/localhost).');
    console.error(`       HOST saat ini: ${HOST}`);
    console.error('       Set APP_TOKEN di environment variable atau ubah HOST ke 127.0.0.1');
    process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data', 'data.xlsx');
const DATA_CACHE_FILE = path.join(__dirname, 'data', '.data-cache.json');
const AWARDS_FILE = path.join(__dirname, 'data', 'penghargaan.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backup');
const PHOTO_DIR = path.join(__dirname, 'assets', 'personel');
const AWARDS_DIR = path.join(__dirname, 'assets', 'awards');
const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 500;

/** Slugify sederhana untuk penamaan berkas (replika dari text-utils.js). */
function slugify(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Konfigurasi multer: simpan ke memori, batas 10 MB. */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpe?g|png|webp|gif|pdf)$/i;
        if (allowed.test(file.originalname) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Tipe berkas tidak diizinkan.'));
        }
    },
});

app.disable('x-powered-by');

// Gzip compression untuk semua response
app.use(compression({
    filter: (req, res) => {
        // Compress semua kecuali yang sudah compressed (images, videos, dll)
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
    level: 6, // Balance antara speed dan compression ratio
    threshold: 1024 // Hanya compress response > 1KB
}));

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - start}ms`);
    });
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Content Security Policy (CSP)
    // Strict CSP untuk LAN deployment - hanya allow same-origin resources
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // unsafe-inline diperlukan untuk inline styles sementara
        "img-src 'self' data:", // data: untuk avatar fallback
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    
    next();
});

// ---------- Autentikasi opsional (aktif hanya bila APP_TOKEN diisi) ----------
const SESSION_VALUE = APP_TOKEN
    ? crypto.createHmac('sha256', APP_TOKEN).update('bawaslu-session').digest('hex')
    : '';

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function readCookie(req, name) {
    for (const part of (req.headers.cookie || '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return '';
}

function isAuthed(req) {
    if (!APP_TOKEN) return true;
    if (SESSION_VALUE && safeEqual(readCookie(req, 'sid'), SESSION_VALUE)) return true;
    const header = req.get('X-App-Token');
    return Boolean(header) && safeEqual(header, APP_TOKEN);
}

function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    res.status(401).type('text/plain').send('Tidak diizinkan. POST ke /api/login dengan body {token: "..."} untuk autentikasi.');
}

// Login endpoint: POST dengan body JSON (bukan query string)
app.post('/api/login', express.json(), (req, res) => {
    if (!APP_TOKEN) {
        return res.status(400).json({ ok: false, error: 'APP_TOKEN tidak dikonfigurasi di server.' });
    }
    
    const token = req.body?.token || '';
    if (!safeEqual(token, APP_TOKEN)) {
        return res.status(401).json({ ok: false, error: 'Token salah.' });
    }
    
    res.cookie('sid', SESSION_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(process.env.HTTPS),
        maxAge: 12 * 60 * 60 * 1000,
    });
    
    res.json({ ok: true, message: 'Login berhasil', expiresIn: 12 * 60 * 60 * 1000 });
});

// GET /login - serve halaman login HTML
app.get('/login', (req, res) => {
    if (!APP_TOKEN) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'login.html'));
});

// ---------- Berkas statis: whitelist, bukan seluruh folder ----------
// Assets publik (CSS, JS, image bawaslu.png)
app.use(
    '/assets/css',
    express.static(path.join(__dirname, 'assets', 'css'), { index: false, dotfiles: 'deny', maxAge: 0 })
);
app.use(
    '/assets/js',
    express.static(path.join(__dirname, 'assets', 'js'), { index: false, dotfiles: 'deny', maxAge: 0 })
);
app.use(
    '/assets/image',
    express.static(path.join(__dirname, 'assets', 'image'), { index: false, dotfiles: 'deny', maxAge: 0 })
);

// Assets yang butuh auth: foto personel & penghargaan (PII)
app.use(
    '/assets/personel',
    requireAuth,
    express.static(path.join(__dirname, 'assets', 'personel'), { index: false, dotfiles: 'deny', maxAge: 0 })
);
app.use(
    '/assets/awards',
    requireAuth,
    express.static(path.join(__dirname, 'assets', 'awards'), { index: false, dotfiles: 'deny', maxAge: 0 })
);

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/', requireAuth, page('index.html'));
app.get('/index.html', requireAuth, page('index.html'));
app.get('/landing.html', page('landing.html'));
app.get('/landing.css', page('landing.css'));

// Berkas data berisi PII: tidak boleh di-cache, wajib lewat autentikasi.
app.get('/data/data.xlsx', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(DATA_FILE);
});

app.get('/data/penghargaan.json', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(AWARDS_FILE);
});

// GET /api/stats - Stats publik untuk landing page (tanpa auth)
app.get('/api/stats', (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.json({ ok: false, error: 'Data tidak tersedia' });
        }
        
        const workbook = XLSX.readFile(DATA_FILE, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        
        const totalPersonel = Math.max(0, grid.length - 1); // kurangi header
        
        // Hitung statistik sederhana tanpa expose PII
        let maleCount = 0;
        let femaleCount = 0;
        
        for (let i = 1; i < grid.length; i++) {
            const row = grid[i];
            const gender = String(row[6] || '').toLowerCase(); // kolom JENIS KELAMIN (index 6)
            if (gender.includes('laki') || gender === 'l' || gender === 'm') maleCount++;
            else if (gender.includes('perempuan') || gender === 'p' || gender === 'f') femaleCount++;
        }
        
        res.json({
            ok: true,
            total: totalPersonel,
            byGender: {
                male: maleCount,
                female: femaleCount
            },
            lastUpdate: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).mtime : null
        });
    } catch (err) {
        console.error('[server] /api/stats error:', err);
        res.status(500).json({ ok: false, error: 'Gagal membaca statistik' });
    }
});

// ---------- Data JSON Fast Endpoint with Persistent Cache ----------
let cachedDataGrid = null;
let lastDataModTime = 0;

/**
 * Baca cache dari file system. Cache valid selama mtime Excel tidak berubah.
 * Format cache: { mtime: number, data: { grid, sheetName, lastModified } }
 */
function readPersistentCache() {
    try {
        if (!fs.existsSync(DATA_CACHE_FILE)) return null;
        
        const cacheContent = fs.readFileSync(DATA_CACHE_FILE, 'utf-8');
        const cache = JSON.parse(cacheContent);
        
        const dataStat = fs.statSync(DATA_FILE);
        if (cache.mtime === dataStat.mtimeMs) {
            console.log('[cache] ✓ Persistent cache HIT - Excel belum berubah');
            return cache.data;
        }
        
        console.log('[cache] ✗ Persistent cache MISS - Excel telah diupdate');
        return null;
    } catch (err) {
        console.warn('[cache] Gagal membaca persistent cache:', err.message);
        return null;
    }
}

/**
 * Simpan hasil parsing ke file system untuk persistent cache.
 */
function writePersistentCache(data) {
    try {
        const dataStat = fs.statSync(DATA_FILE);
        const cache = {
            mtime: dataStat.mtimeMs,
            data,
            cachedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(DATA_CACHE_FILE, JSON.stringify(cache), 'utf-8');
        console.log('[cache] ✓ Persistent cache SAVED');
    } catch (err) {
        console.warn('[cache] Gagal menyimpan persistent cache:', err.message);
    }
}

/**
 * Invalidate cache saat data Excel berubah.
 */
function invalidatePersistentCache() {
    try {
        if (fs.existsSync(DATA_CACHE_FILE)) {
            fs.unlinkSync(DATA_CACHE_FILE);
            console.log('[cache] ✓ Persistent cache INVALIDATED');
        }
    } catch (err) {
        console.warn('[cache] Gagal menghapus cache:', err.message);
    }
}

app.get('/api/data', requireAuth, (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.status(404).json({ ok: false, error: 'Berkas data tidak ditemukan.' });
        }
        
        const stat = fs.statSync(DATA_FILE);
        const mtime = stat.mtimeMs;
        
        // 1. Cek memory cache
        if (cachedDataGrid && mtime === lastDataModTime) {
            console.log('[cache] ✓ Memory cache HIT');
            res.setHeader('X-Cache', 'HIT-MEMORY');
            return res.json({ ok: true, data: { ...cachedDataGrid, mtime } });
        }
        
        // 2. Cek persistent cache
        const persistentCache = readPersistentCache();
        if (persistentCache) {
            cachedDataGrid = persistentCache;
            lastDataModTime = mtime;
            res.setHeader('X-Cache', 'HIT-DISK');
            return res.json({ ok: true, data: { ...cachedDataGrid, mtime } });
        }
        
        // 3. Parse Excel (cache MISS)
        console.log('[cache] ✗ Cache MISS - Parsing Excel...');
        const startTime = Date.now();
        
        // PERBAIKAN: cellDates + raw: true untuk preserve tipe data asli
        const workbook = XLSX.readFile(DATA_FILE, { cellDates: true, cellNF: false, cellText: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        if (!sheet) {
            return res.status(500).json({ ok: false, error: 'Sheet tidak ditemukan.' });
        }
        
        // raw: true mempertahankan tipe asli (number tetap number, date tetap date)
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: true });
        
        cachedDataGrid = { grid, sheetName, lastModified: new Date(mtime).toISOString(), mtime };
        lastDataModTime = mtime;
        
        // Simpan ke persistent cache
        writePersistentCache(cachedDataGrid);
        
        const parseTime = Date.now() - startTime;
        console.log(`[cache] ✓ Excel parsed in ${parseTime}ms (${grid.length} rows)`);
        
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Parse-Time', parseTime.toString());
        res.json({ ok: true, data: cachedDataGrid });
        
    } catch (err) {
        console.error('[server] gagal membaca excel:', err);
        res.status(500).json({ ok: false, error: 'Gagal membaca data Excel.' });
    }
});

// Endpoint ringan untuk mendapatkan mtime saja (untuk concurrency check)
app.get('/api/data-mtime', requireAuth, (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.status(404).json({ ok: false, error: 'Berkas data tidak ditemukan.' });
        }
        const mtime = fs.statSync(DATA_FILE).mtimeMs;
        res.json({ ok: true, mtime });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Gagal membaca mtime.' });
    }
});

// ---------- Simpan ----------
app.use(express.json({ limit: '1mb' }));

function toExcelRow(row) {
    const out = {};
    for (const col of EXCEL_COLUMNS) out[col] = '';
    
    for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('_') || value === null || value === undefined) continue;
        const col = KEY_TO_COLUMN[key] || (EXCEL_COLUMNS.includes(key) ? key : null);
        if (!col) continue; // kolom tak dikenal diabaikan, tidak ditulis mentah
        
        // PERBAIKAN: Preserve tipe data untuk kolom tertentu
        if (col === 'ID') {
            // Kolom ID: tetap sebagai string uppercase
            out[col] = String(value).toUpperCase().trim();
        } else if (col === 'NO' || col === 'NO URUT') {
            // Kolom nomor: pastikan sebagai number
            const num = Number(value);
            out[col] = Number.isNaN(num) ? '' : num;
        } else if (col === 'AMJ') {
            // Kolom tanggal: konversi ke ISO date string konsisten (YYYY-MM-DD)
            if (value instanceof Date) {
                out[col] = value.toISOString().split('T')[0];
            } else if (typeof value === 'string' && value.trim()) {
                // Parsing string date
                const parsed = new Date(value);
                if (!isNaN(parsed.getTime())) {
                    out[col] = parsed.toISOString().split('T')[0];
                } else {
                    // Fallback: simpan as-is bila tidak bisa diparsing
                    out[col] = String(value).slice(0, MAX_CELL_LENGTH);
                }
            } else if (typeof value === 'number') {
                // Excel serial date number
                const date = XLSX.SSF.parse_date_code(value);
                out[col] = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            } else {
                out[col] = '';
            }
        } else {
            // Kolom teks: tetap sebagai string, potong bila terlalu panjang
            out[col] = String(value).slice(0, MAX_CELL_LENGTH);
        }
    }
    return out;
}

function rotateBackups(keep = 10) {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.xlsx')).sort();
    for (const file of files.slice(0, Math.max(0, files.length - keep))) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
    }
}

app.post('/api/save', requireAuth, (req, res) => {
    const rows = req.body && req.body.rows;
    const baseMtime = req.body && req.body.baseMtime; // Optimistic concurrency control
    const confirmBulkDelete = req.body && req.body.confirmBulkDelete; // Guard penghapusan massal
    
    if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'Body harus { rows: [...] }.' });
    if (rows.length === 0) return res.status(400).json({ ok: false, error: 'Tidak ada baris untuk disimpan.' });
    if (rows.length > MAX_ROWS) {
        return res.status(413).json({ ok: false, error: 'Terlalu banyak baris (maks ' + MAX_ROWS + ').' });
    }
    if (rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r))) {
        return res.status(400).json({ ok: false, error: 'Setiap baris harus berupa objek.' });
    }

    // Validasi skema: cek field wajib, format email, dll
    const validationIssues = [];
    rows.forEach((row, idx) => {
        const issues = validateRecord(row);
        const errors = issues.filter(i => i.severity === 'error');
        if (errors.length > 0) {
            validationIssues.push({
                rowIndex: idx,
                nama: row.nama || '(tanpa nama)',
                errors: errors.map(e => `${e.field}: ${e.message}`)
            });
        }
    });
    
    if (validationIssues.length > 0) {
        return res.status(422).json({
            ok: false,
            error: `Validasi gagal untuk ${validationIssues.length} baris.`,
            issues: validationIssues.slice(0, 10), // Kirim max 10 untuk hindari response terlalu besar
            hint: 'Perbaiki kesalahan sebelum menyimpan.'
        });
    }

    // Optimistic concurrency: periksa apakah file sudah berubah sejak klien terakhir membaca
    if (baseMtime && fs.existsSync(DATA_FILE)) {
        const currentMtime = fs.statSync(DATA_FILE).mtimeMs;
        if (currentMtime !== baseMtime) {
            return res.status(409).json({ 
                ok: false, 
                error: 'Data di server sudah berubah oleh pengguna lain.',
                hint: 'Muat ulang data terlebih dahulu, lalu ulangi perubahan Anda.',
                currentMtime 
            });
        }
    }

    // Guard penghapusan massal: tolak bila jumlah baris berkurang > 20% tanpa konfirmasi eksplisit
    if (fs.existsSync(DATA_FILE)) {
        try {
            const workbook = XLSX.readFile(DATA_FILE, { cellDates: false });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const existingGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
            const existingCount = existingGrid.length - 1; // kurangi header
            
            if (existingCount > 0) {
                const lossPercent = ((existingCount - rows.length) / existingCount) * 100;
                if (lossPercent > 20 && !confirmBulkDelete) {
                    return res.status(409).json({
                        ok: false,
                        error: `Penghapusan massal terdeteksi: ${rows.length} baris dikirim, saat ini ${existingCount} baris (kehilangan ${Math.round(lossPercent)}%).`,
                        hint: 'Pastikan Anda tidak sedang menyimpan data yang terfilter. Kirim ulang dengan confirmBulkDelete: true bila yakin.',
                        requireConfirmBulkDelete: true
                    });
                }
            }
        } catch (err) {
            console.warn('[server] gagal membaca file untuk guard bulk delete:', err.message);
            // Lanjutkan, jangan blokir karena error baca file lama
        }
    }

    const data = rows.map(toExcelRow);

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, 'data-' + stamp + '.xlsx'));
        rotateBackups(10);
    }

    const sheet = XLSX.utils.json_to_sheet(data, { header: EXCEL_COLUMNS });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'DATA');

    // Tulis ke berkas sementara di direktori yang sama, lalu rename -> atomik.
    const tmp = DATA_FILE + '.' + process.pid + '.tmp';
    XLSX.writeFile(book, tmp);
    fs.renameSync(tmp, DATA_FILE);
    
    // Clear cache (memory & persistent)
    cachedDataGrid = null;
    lastDataModTime = 0;
    invalidatePersistentCache();

    const newMtime = fs.statSync(DATA_FILE).mtimeMs;
    res.json({ ok: true, rows: data.length, savedAt: new Date().toISOString(), mtime: newMtime });
});

// ---------- Upload Foto Personel ----------

app.post('/api/upload-photo', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        const nama = String(req.body?.nama ?? '').trim();
        if (!nama) return res.status(400).json({ ok: false, error: 'Nama personel wajib diisi.' });
        if (!req.file) return res.status(400).json({ ok: false, error: 'Berkas foto tidak ditemukan.' });

        // Verifikasi magic bytes: hanya terima JPEG, PNG, WebP, GIF
        const buffer = req.file.buffer;
        const magicBytes = buffer.slice(0, 12);
        const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF;
        const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
        const isWebP = magicBytes[8] === 0x57 && magicBytes[9] === 0x45 && magicBytes[10] === 0x42 && magicBytes[11] === 0x50;
        const isGIF = magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46;

        if (!isJPEG && !isPNG && !isWebP && !isGIF) {
            return res.status(400).json({ 
                ok: false, 
                error: 'Format file tidak valid. Hanya JPEG, PNG, WebP, atau GIF yang diterima.' 
            });
        }

        const slug = slugify(nama);
        if (!slug) return res.status(400).json({ ok: false, error: 'Nama tidak valid untuk slug.' });

        fs.mkdirSync(PHOTO_DIR, { recursive: true });

        const filename = slug + '.webp';
        const destPath = path.join(PHOTO_DIR, filename);

        // Konversi ke WebP, resize maksimal 400x400, kualitas 80
        await sharp(buffer)
            .resize(400, 400, { fit: 'cover', position: 'top' })
            .webp({ quality: 80 })
            .toFile(destPath);

        // Update manifes foto jika ada
        const manifestPath = path.join(PHOTO_DIR, 'index.json');
        try {
            let manifest = [];
            if (fs.existsSync(manifestPath)) {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            }
            if (!manifest.includes(filename)) {
                manifest.push(filename);
                manifest.sort();
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }
        } catch (manifestErr) {
            console.warn('[server] gagal update manifes foto:', manifestErr.message);
        }

        const relativePath = 'assets/personel/' + filename;
        res.json({ ok: true, path: relativePath, filename });
    } catch (err) {
        console.error('[server] upload foto gagal:', err);
        res.status(500).json({ ok: false, error: 'Gagal memproses foto: ' + err.message });
    }
});

// ---------- Rename Foto (saat nama personel berubah) ----------

app.post('/api/rename-photo', requireAuth, express.json(), (req, res) => {
    const oldName = String(req.body?.oldName ?? '').trim();
    const newName = String(req.body?.newName ?? '').trim();
    if (!oldName || !newName) return res.status(400).json({ ok: false, error: 'oldName dan newName wajib diisi.' });

    const oldSlug = slugify(oldName);
    const newSlug = slugify(newName);
    if (!oldSlug || !newSlug) return res.status(400).json({ ok: false, error: 'Nama tidak valid.' });
    if (oldSlug === newSlug) return res.json({ ok: true, renamed: false, message: 'Nama sama, tidak perlu rename.' });

    const oldPath = path.join(PHOTO_DIR, oldSlug + '.webp');
    const newPath = path.join(PHOTO_DIR, newSlug + '.webp');

    if (!fs.existsSync(oldPath)) return res.json({ ok: true, renamed: false, message: 'Foto lama tidak ditemukan.' });

    try {
        fs.renameSync(oldPath, newPath);

        // Update manifes
        const manifestPath = path.join(PHOTO_DIR, 'index.json');
        try {
            if (fs.existsSync(manifestPath)) {
                let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                manifest = manifest.filter((f) => f !== oldSlug + '.webp');
                if (!manifest.includes(newSlug + '.webp')) manifest.push(newSlug + '.webp');
                manifest.sort();
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }
        } catch (_) { /* abaikan */ }

        res.json({ ok: true, renamed: true, newPath: 'assets/personel/' + newSlug + '.webp' });
    } catch (err) {
        console.error('[server] rename foto gagal:', err);
        res.status(500).json({ ok: false, error: 'Gagal rename foto.' });
    }
});

// ---------- Simpan Data Penghargaan ----------

app.post('/api/save-awards', requireAuth, (req, res) => {
    const awards = req.body?.awards;
    if (!Array.isArray(awards)) return res.status(400).json({ ok: false, error: 'Body harus { awards: [...] }.' });

    // Validasi skema per item
    const MAX_AWARDS_PER_PERSON = 50;
    const MAX_PENGHARGAAN_LENGTH = 200;
    const MAX_BUKTI_LENGTH = 500;
    
    const errors = [];
    const personAwardCount = new Map();
    
    awards.forEach((award, idx) => {
        if (typeof award !== 'object' || award === null) {
            errors.push(`Item #${idx + 1}: harus berupa objek`);
            return;
        }
        
        // Field wajib
        const nama = String(award.nama || award.Nama || '').trim();
        const penghargaan = String(award.penghargaan || '').trim();
        
        if (!nama) errors.push(`Item #${idx + 1}: field 'nama' wajib diisi`);
        if (!penghargaan) errors.push(`Item #${idx + 1}: field 'penghargaan' wajib diisi`);
        
        // Validasi panjang
        if (penghargaan.length > MAX_PENGHARGAAN_LENGTH) {
            errors.push(`Item #${idx + 1}: 'penghargaan' terlalu panjang (maks ${MAX_PENGHARGAAN_LENGTH} karakter)`);
        }
        
        const bukti = String(award.bukti || '').trim();
        if (bukti && bukti.length > MAX_BUKTI_LENGTH) {
            errors.push(`Item #${idx + 1}: 'bukti' terlalu panjang (maks ${MAX_BUKTI_LENGTH} karakter)`);
        }
        
        // Hitung penghargaan per orang
        if (nama) {
            const key = nama.toLowerCase();
            personAwardCount.set(key, (personAwardCount.get(key) || 0) + 1);
        }
    });
    
    // Cek jumlah penghargaan per orang
    for (const [nama, count] of personAwardCount) {
        if (count > MAX_AWARDS_PER_PERSON) {
            errors.push(`Personel '${nama}' memiliki ${count} penghargaan (maks ${MAX_AWARDS_PER_PERSON})`);
        }
    }
    
    if (errors.length > 0) {
        return res.status(422).json({ 
            ok: false, 
            error: 'Validasi gagal untuk data penghargaan.',
            errors: errors.slice(0, 10), // Batasi 10 error pertama
            totalErrors: errors.length
        });
    }

    // Backup penghargaan.json lama
    const backupDir = path.join(__dirname, 'data', 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(AWARDS_FILE)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(AWARDS_FILE, path.join(backupDir, 'penghargaan-' + stamp + '.json'));
        // Rotasi backup penghargaan juga (10 terakhir)
        const awardBackups = fs.readdirSync(backupDir).filter((f) => f.startsWith('penghargaan-') && f.endsWith('.json')).sort();
        for (const file of awardBackups.slice(0, Math.max(0, awardBackups.length - 10))) {
            fs.unlinkSync(path.join(backupDir, file));
        }
    }

    // Simpan atomik
    const tmp = AWARDS_FILE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(awards, null, 4), 'utf-8');
    fs.renameSync(tmp, AWARDS_FILE);

    res.json({ ok: true, count: awards.length, savedAt: new Date().toISOString() });
});

// ---------- Upload Bukti Penghargaan ----------

app.post('/api/upload-proof', requireAuth, upload.single('proof'), (req, res) => {
    try {
        const kabkota = String(req.body?.kabkota ?? '').trim();
        const nama = String(req.body?.nama ?? '').trim();
        if (!nama) return res.status(400).json({ ok: false, error: 'Nama personel wajib diisi.' });
        if (!req.file) return res.status(400).json({ ok: false, error: 'Berkas bukti tidak ditemukan.' });

        const regionSlug = slugify(kabkota) || 'unknown';
        const nameSlug = slugify(nama);
        if (!nameSlug) return res.status(400).json({ ok: false, error: 'Nama tidak valid.' });

        const destDir = path.join(AWARDS_DIR, regionSlug, nameSlug);
        fs.mkdirSync(destDir, { recursive: true });

        // Sanitasi nama berkas asli
        const origExt = path.extname(req.file.originalname).toLowerCase() || '.pdf';
        const safeName = req.file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 100);
        const filename = safeName.endsWith(origExt) ? safeName : safeName + origExt;
        const destPath = path.join(destDir, filename);

        fs.writeFileSync(destPath, req.file.buffer);

        const relativePath = 'assets/awards/' + regionSlug + '/' + nameSlug + '/' + filename;
        res.json({ ok: true, path: relativePath, filename });
    } catch (err) {
        console.error('[server] upload bukti gagal:', err);
        res.status(500).json({ ok: false, error: 'Gagal menyimpan bukti: ' + err.message });
    }
});

app.use((req, res) => res.status(404).type('text/plain').send('404 Not Found'));

// eslint-disable-next-line no-unused-vars -- Express mengenali error handler dari 4 parameter
app.use((err, req, res, next) => {
    console.error('[server]', err);
    res.status(500).json({ ok: false, error: 'Terjadi kesalahan di server.' });
});

// ==================== STARTUP: GENERATE MANIFEST ====================

/**
 * Pindai folder foto & penghargaan, generate manifest.
 * Dipanggil otomatis saat server start.
 */
async function generateManifests() {
    console.log('[startup] Generating manifests...');
    
    // 1. Manifest foto
    const photoManifest = path.join(__dirname, 'assets', 'personel', 'index.json');
    try {
        if (fs.existsSync(PHOTO_DIR)) {
            const files = fs.readdirSync(PHOTO_DIR)
                .filter(f => f.endsWith('.webp'))
                .sort();
            
            const manifest = {
                _generated: new Date().toISOString(),
                _count: files.length,
                files: files
            };
            
            fs.writeFileSync(photoManifest, JSON.stringify(manifest, null, 2));
            console.log(`[startup] ✓ Photo manifest: ${files.length} files`);
        }
    } catch (err) {
        console.error('[startup] ⚠ Failed to generate photo manifest:', err.message);
    }
    
    // 2. Manifest penghargaan (per kabupaten)
    const awardsManifest = path.join(__dirname, 'assets', 'awards', 'index.json');
    try {
        if (fs.existsSync(AWARDS_DIR)) {
            const kabupaten = {};
            const kabFolders = fs.readdirSync(AWARDS_DIR, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name !== 'node_modules');
            
            for (const kabDir of kabFolders) {
                const kabPath = path.join(AWARDS_DIR, kabDir.name);
                const personFolders = fs.readdirSync(kabPath, { withFileTypes: true })
                    .filter(d => d.isDirectory());
                
                kabupaten[kabDir.name] = personFolders.map(p => p.name).sort();
            }
            
            const manifest = {
                _generated: new Date().toISOString(),
                _kabupatenCount: Object.keys(kabupaten).length,
                _totalPersonel: Object.values(kabupaten).reduce((sum, arr) => sum + arr.length, 0),
                kabupaten
            };
            
            fs.writeFileSync(awardsManifest, JSON.stringify(manifest, null, 2));
            console.log(`[startup] ✓ Awards manifest: ${manifest._totalPersonel} personel across ${manifest._kabupatenCount} kabupaten`);
        }
    } catch (err) {
        console.error('[startup] ⚠ Failed to generate awards manifest:', err.message);
    }
}

app.listen(PORT, HOST, async () => {
    console.log('Server berjalan di http://' + HOST + ':' + PORT);
    if (!APP_TOKEN) {
        console.warn('PERINGATAN: APP_TOKEN kosong — /data/data.xlsx dan /api/save terbuka tanpa autentikasi.');
    }
    if (HOST === '0.0.0.0' && !APP_TOKEN) {
        console.warn('PERINGATAN: server terbuka ke seluruh jaringan TANPA autentikasi. Jangan dipakai membawa data asli.');
    }
    
    // Generate manifests otomatis saat startup
    await generateManifests();
    console.log('[startup] ✅ Server ready');
});