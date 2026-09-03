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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const APP_TOKEN = process.env.APP_TOKEN || '';
const DATA_FILE = path.join(__dirname, 'data', 'data.xlsx');
const DATA_CACHE_FILE = path.join(__dirname, 'data', '.data-cache.json');
const AWARDS_FILE = path.join(__dirname, 'data', 'penghargaan.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backup');
const PHOTO_DIR = path.join(__dirname, 'assets', 'personel');
const AWARDS_DIR = path.join(__dirname, 'assets', 'awards');
const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 500;

/** Urutan kolom Excel — eksplisit, tidak bergantung pada kunci objek pertama. */
const EXCEL_COLUMNS = [
    'NO', 'PROVINSI', 'KABUPATEN/KOTA', 'NO URUT', 'NAMA', 'JENIS KELAMIN', 'JABATAN',
    'WAKORDIV', 'DIVISI', 'AMJ', 'AGAMA', 'PENDIDIKAN', 'HP', 'EMAIL PRIBADI',
    'EMAIL KANTOR', 'ALAMAT', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'FOTO',
];

const KEY_TO_COLUMN = {
    no: 'NO', provinsi: 'PROVINSI', kabkota: 'KABUPATEN/KOTA', noUrut: 'NO URUT',
    nama: 'NAMA', gender: 'JENIS KELAMIN', jabatan: 'JABATAN', wakordiv: 'WAKORDIV',
    div: 'DIVISI', amj: 'AMJ', agama: 'AGAMA', pendidikan: 'PENDIDIKAN', hp: 'HP',
    emailP: 'EMAIL PRIBADI', emailK: 'EMAIL KANTOR', alamat: 'ALAMAT',
    facebook: 'FACEBOOK', instagram: 'INSTAGRAM', website: 'WEBSITE', foto: 'FOTO',
};

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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
    res.status(401).type('text/plain').send('Tidak diizinkan. Buka /login?token=... lebih dulu.');
}

app.get('/login', (req, res) => {
    if (!APP_TOKEN) return res.redirect('/');
    if (!safeEqual(req.query.token || '', APP_TOKEN)) {
        return res.status(401).type('text/plain').send('Token salah.');
    }
    res.cookie('sid', SESSION_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(process.env.HTTPS),
        maxAge: 12 * 60 * 60 * 1000,
    });
    res.redirect('/');
});

// ---------- Berkas statis: whitelist, bukan seluruh folder ----------
app.use(
    '/assets',
    express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'deny', maxAge: 0 })
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
        
        const workbook = XLSX.readFile(DATA_FILE, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        if (!sheet) {
            return res.status(500).json({ ok: false, error: 'Sheet tidak ditemukan.' });
        }
        
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });
        
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
        out[col] = String(value).slice(0, MAX_CELL_LENGTH);
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

        const slug = slugify(nama);
        if (!slug) return res.status(400).json({ ok: false, error: 'Nama tidak valid untuk slug.' });

        fs.mkdirSync(PHOTO_DIR, { recursive: true });

        const filename = slug + '.webp';
        const destPath = path.join(PHOTO_DIR, filename);

        // Konversi ke WebP, resize maksimal 400x400, kualitas 80
        await sharp(req.file.buffer)
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

    // Backup penghargaan.json lama
    const backupDir = path.join(__dirname, 'data', 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(AWARDS_FILE)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(AWARDS_FILE, path.join(backupDir, 'penghargaan-' + stamp + '.json'));
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

app.listen(PORT, HOST, () => {
    console.log('Server berjalan di http://' + HOST + ':' + PORT);
    if (!APP_TOKEN) {
        console.warn('PERINGATAN: APP_TOKEN kosong — /data/data.xlsx dan /api/save terbuka tanpa autentikasi.');
    }
    if (HOST === '0.0.0.0' && !APP_TOKEN) {
        console.warn('PERINGATAN: server terbuka ke seluruh jaringan TANPA autentikasi. Jangan dipakai membawa data asli.');
    }
});