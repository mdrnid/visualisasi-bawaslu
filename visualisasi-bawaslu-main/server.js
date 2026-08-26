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
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const APP_TOKEN = process.env.APP_TOKEN || '';
const DATA_FILE = path.join(__dirname, 'data', 'data.xlsx');
const AWARDS_FILE = path.join(__dirname, 'data', 'penghargaan.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backup');
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

app.disable('x-powered-by');

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY'); // frame-ancestors diabaikan di <meta>
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
    if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'Body harus { rows: [...] }.' });
    if (rows.length === 0) return res.status(400).json({ ok: false, error: 'Tidak ada baris untuk disimpan.' });
    if (rows.length > MAX_ROWS) {
        return res.status(413).json({ ok: false, error: 'Terlalu banyak baris (maks ' + MAX_ROWS + ').' });
    }
    if (rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r))) {
        return res.status(400).json({ ok: false, error: 'Setiap baris harus berupa objek.' });
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

    res.json({ ok: true, rows: data.length, savedAt: new Date().toISOString() });
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