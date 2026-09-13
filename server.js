/**
 * server.js
 * 
 * Server statis + API untuk Visualisasi Personel Bawaslu.
 * Sumber kebenaran data: Supabase Postgres (schema api) via lib/db.js.
 * Berkas Excel hanya digunakan untuk import/export/backup oleh script CLI.
 */
'use strict';

import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import { validateRecord } from './assets/js/schema.js';
import { supabaseAdmin, isDbConfigured } from './lib/db.js';
import { slugify, stripNameTitles } from './assets/js/text-utils.js';
import { compressProofBuffer } from './utils/compressor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1'; // Default loopback (aman)
const APP_TOKEN = process.env.APP_TOKEN || '';

// Autentikasi opsional: jika APP_TOKEN kosong, login dinonaktifkan
if (!APP_TOKEN) {
    console.log('[auth] Mode tanpa autentikasi: langsung akses dashboard tanpa login.');
}

const PHOTO_DIR = path.join(__dirname, 'assets', 'personel');
const AWARDS_DIR = path.join(__dirname, 'assets', 'awards');
const MAX_ROWS = 5000;

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
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
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
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "img-src 'self' data: blob: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    
    next();
});

// ---------- Autentikasi lokal APP_TOKEN ----------
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

// Login endpoint
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

app.get('/login', (req, res) => {
    if (!APP_TOKEN) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'login.html'));
});

// ---------- Berkas statis ----------
app.use('/assets/css', express.static(path.join(__dirname, 'assets', 'css'), { index: false, dotfiles: 'deny', maxAge: 0 }));
app.use('/assets/js', express.static(path.join(__dirname, 'assets', 'js'), { index: false, dotfiles: 'deny', maxAge: 0 }));
app.use('/assets/image', express.static(path.join(__dirname, 'assets', 'image'), { index: false, dotfiles: 'deny', maxAge: 0 }));
app.use('/assets/developed', express.static(path.join(__dirname, 'assets', 'developed'), { index: false, dotfiles: 'deny', maxAge: 0 }));
app.use('/assets/personel', requireAuth, express.static(path.join(__dirname, 'assets', 'personel'), { index: false, dotfiles: 'deny', maxAge: 0 }));
app.use('/assets/awards', requireAuth, express.static(path.join(__dirname, 'assets', 'awards'), { index: false, dotfiles: 'deny', maxAge: 0 }));

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/', page('landing.html'));
app.get('/dashboard', page('index.html'));
app.get('/index.html', page('index.html'));
app.get('/landing', page('landing.html'));
app.get('/landing.html', page('landing.html'));
app.get('/landing.css', page('landing.css'));

// ---------- DATA ACCESS LAYER: SUPABASE POSTGRES ----------
// ponytail: simple memory cache to survive ENOTFOUND and speed up loads. Add Redis when memory/multi-instance requires it.
const memCache = {};
const CACHE_TTL = 30000; // 30s

// 1. GET /api/stats - Statistik publik (nama kolom teragregasi, memperbaiki bug row[6])
app.get('/api/stats', async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi di server.' });
        }
        if (memCache.stats && Date.now() < memCache.statsExp) return res.json(memCache.stats);

        const { count: total, error: tErr } = await supabaseAdmin
            .from('personnel')
            .select('*', { count: 'exact', head: true })
            .is('deleted_at', null);

        if (tErr) throw tErr;

        const { count: maleCount, error: mErr } = await supabaseAdmin
            .from('personnel')
            .select('*', { count: 'exact', head: true })
            .is('deleted_at', null)
            .eq('gender', 'L');

        if (mErr) throw mErr;

        const { count: femaleCount, error: fErr } = await supabaseAdmin
            .from('personnel')
            .select('*', { count: 'exact', head: true })
            .is('deleted_at', null)
            .eq('gender', 'P');

        if (fErr) throw fErr;

        const { data: latestRecord } = await supabaseAdmin
            .from('personnel')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1);

        memCache.stats = {
            ok: true,
            total: total || 0,
            byGender: {
                male: maleCount || 0,
                female: femaleCount || 0,
            },
            lastUpdate: latestRecord?.[0]?.updated_at || new Date().toISOString(),
        };
        memCache.statsExp = Date.now() + CACHE_TTL;
        res.json(memCache.stats);
    } catch (err) {
        if (memCache.stats) return res.json(memCache.stats);
        console.error('[server] /api/stats error:', err);
        res.status(500).json({ ok: false, error: 'Gagal membaca statistik dari database.' });
    }
});

// 2. GET /api/data - Baca data personel dari Postgres
app.get('/api/data', requireAuth, async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }
        if (memCache.data && Date.now() < memCache.dataExp) return res.json(memCache.data);

        const { data: records, error } = await supabaseAdmin
            .from('personnel')
            .select('*')
            .is('deleted_at', null)
            .order('personnel_code', { ascending: true });

        if (error) throw error;

        // Susun struktur grid 2D yang kompatibel dengan parser frontend
        // Kolom id dan version ditambahkan secara additive di awal
        const headerRow = [
            'ID', 'VERSION', 'PROVINSI', 'KABUPATEN/KOTA', 'NAMA', 'JENIS KELAMIN',
            'JABATAN', 'WAKORDIV', 'DIVISI', 'AMJ', 'AGAMA', 'PENDIDIKAN',
            'HP', 'EMAIL PRIBADI', 'EMAIL KANTOR', 'ALAMAT', 'FACEBOOK',
            'INSTAGRAM', 'WEBSITE', 'FOTO'
        ];

        const grid = [headerRow];
        let maxMtime = 0;

        for (const p of records) {
            const updatedAtMs = new Date(p.updated_at).getTime();
            if (updatedAtMs > maxMtime) maxMtime = updatedAtMs;

            const genderStr = p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : (p.gender || '');
            const amjStr = p.term_raw || (p.term_end ? p.term_end : '');

            grid.push([
                p.id,
                p.version,
                p.province || '',
                p.district || '',
                p.name || '',
                genderStr,
                p.position || '',
                p.wakordiv || '',
                p.division || '',
                amjStr,
                p.religion || '',
                p.education || '',
                p.phone || '',
                p.private_email || '',
                p.office_email || '',
                p.office_address || '',
                p.facebook || '',
                p.instagram || '',
                p.website || '',
                p.photo_local_path || '',
            ]);
        }

        memCache.data = {
            ok: true,
            data: {
                grid,
                sheetName: 'DATA',
                lastModified: new Date(maxMtime || Date.now()).toISOString(),
                mtime: maxMtime || Date.now(),
            }
        };
        memCache.dataExp = Date.now() + CACHE_TTL;
        res.json(memCache.data);
    } catch (err) {
        if (memCache.data) return res.json(memCache.data);
        console.error('[server] /api/data error:', err);
        res.status(500).json({ ok: false, error: 'Gagal membaca data dari database: ' + err.message });
    }
});

// Endpoint data-mtime
app.get('/api/data-mtime', requireAuth, async (req, res) => {
    try {
        const { data } = await supabaseAdmin
            .from('personnel')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1);

        const mtime = data?.[0]?.updated_at ? new Date(data[0].updated_at).getTime() : Date.now();
        res.json({ ok: true, mtime });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Gagal membaca mtime.' });
    }
});

// Endpoint fallback data/penghargaan.json (membaca langsung dari DB jika dipanggil oleh awards.js)
app.get('/data/penghargaan.json', requireAuth, async (req, res) => {
    try {
        if (memCache.awards && Date.now() < memCache.awardsExp) return res.json(memCache.awards);

        const { data: awards, error } = await supabaseAdmin
            .from('awards')
            .select(`
                id,
                title,
                category,
                issuer,
                proof_local_path,
                proof_object_path,
                personnel:personnel_id (
                    name,
                    district,
                    position,
                    wakordiv
                )
            `);

        if (error) throw error;

        // Transformasi ke bentuk array JSON penghargaan lama
        const output = (awards || []).map(a => {
            let buktiUrl = a.proof_local_path || '';
            if (a.proof_object_path) {
                const { data: storageData } = supabaseAdmin.storage
                    .from('award-proofs')
                    .getPublicUrl(a.proof_object_path);
                if (storageData?.publicUrl) {
                    buktiUrl = storageData.publicUrl;
                }
            }
            return {
                id: a.id,
                kabkota: a.personnel?.district || '',
                nama: a.personnel?.name || '',
                jabatan: a.personnel?.position || '',
                wakordiv: a.personnel?.wakordiv || '',
                penghargaan: a.title,
                kategori: a.category || '',
                bukti: buktiUrl,
            };
        });

        res.setHeader('Cache-Control', 'no-store');
        memCache.awards = output;
        memCache.awardsExp = Date.now() + CACHE_TTL;
        res.json(output);
    } catch (err) {
        if (memCache.awards) return res.json(memCache.awards);
        console.warn('[server] fallback penghargaan.json error:', err.message);
        const legacyFile = path.join(__dirname, 'data', 'penghargaan.json');
        if (fs.existsSync(legacyFile)) {
            res.sendFile(legacyFile);
        } else {
            res.json([]);
        }
    }
});

// 3. POST /api/save - Simpan data (Diff-based, per record, dengan optimistic concurrency)
app.use(express.json({ limit: '5mb' }));

app.post('/api/save', requireAuth, async (req, res) => {
    try {
        const rows = req.body?.rows;
        const baseMtime = req.body?.baseMtime;
        const confirmBulkDelete = req.body?.confirmBulkDelete;

        if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'Body harus { rows: [...] }.' });
        if (rows.length === 0) return res.status(400).json({ ok: false, error: 'Tidak ada baris untuk disimpan.' });
        if (rows.length > MAX_ROWS) return res.status(413).json({ ok: false, error: 'Terlalu banyak baris.' });

        // Validasi format baris
        const validationIssues = [];
        rows.forEach((row, idx) => {
            const issues = validateRecord(row, { strictEmail: true });
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
                issues: validationIssues.slice(0, 10),
                hint: 'Perbaiki kesalahan sebelum menyimpan.'
            });
        }

        // Ambil data saat ini dari DB untuk menghitung DIFF
        const { data: currentDbRows, error: fetchErr } = await supabaseAdmin
            .from('personnel')
            .select('*')
            .is('deleted_at', null);

        if (fetchErr) throw fetchErr;

        const currentCount = currentDbRows.length;

        // Guard bulk delete: tolak jika berkurang > 20% tanpa konfirmasi
        if (currentCount > 0) {
            const lossPercent = ((currentCount - rows.length) / currentCount) * 100;
            if (lossPercent > 20 && !confirmBulkDelete) {
                return res.status(409).json({
                    ok: false,
                    error: `Penghapusan massal terdeteksi: ${rows.length} baris dikirim, saat ini ${currentCount} baris (kehilangan ${Math.round(lossPercent)}%).`,
                    hint: 'Pastikan Anda tidak sedang menyimpan data yang terfilter. Kirim ulang dengan confirmBulkDelete: true bila yakin.',
                    requireConfirmBulkDelete: true
                });
            }
        }



        // Petakan record database berdasarkan ID (UUID), personnel_code (PRS-XXXX), dan Nama
        const dbById = new Map();
        const dbByName = new Map();
        currentDbRows.forEach(r => {
            if (r.id) dbById.set(r.id, r);
            if (r.personnel_code) dbById.set(r.personnel_code, r);
            dbByName.set(slugify(stripNameTitles(r.name)), r);
        });

        const touchedIds = new Set();
        
        // Hitung maxExistingNum dari SELURUH record (termasuk yang soft-deleted) agar tidak bentrok 23505
        const { data: allCodeRows } = await supabaseAdmin
            .from('personnel')
            .select('personnel_code');

        let maxExistingNum = 0;
        (allCodeRows || []).forEach(r => {
            const m = r.personnel_code?.match(/PRS-(\d+)/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxExistingNum) maxExistingNum = n;
            }
        });

        // 1. UPDATE & INSERT per record
        let updateCount = 0, insertCount = 0, skipCount = 0;
        for (const r of rows) {
            const rowId = r.id;
            const nameKey = slugify(stripNameTitles(r.nama));
            const existing = (rowId && dbById.get(rowId)) || dbByName.get(nameKey);

            // Parsing gender
            let g = null;
            const rawG = String(r.gender || '').toLowerCase();
            if (rawG.includes('l') || rawG.includes('pria')) g = 'L';
            else if (rawG.includes('p') || rawG.includes('wanita')) g = 'P';

            const recordData = {
                province: r.provinsi || null,
                district: r.kabkota || null,
                name: r.nama,
                gender: g,
                position: r.jabatan || null,
                wakordiv: r.wakordiv || null,
                division: r.div || null,
                term_raw: r.amj || null,
                religion: r.agama || null,
                education: r.pendidikan || null,
                phone: r.hp || null,
                private_email: r.emailP ? r.emailP.toLowerCase() : null,
                office_email: r.emailK ? r.emailK.toLowerCase() : null,
                office_address: r.alamat || null,
                facebook: r.facebook || null,
                instagram: r.instagram || null,
                website: r.website || null,
                photo_local_path: r.foto || null,
            };

            if (existing) {
                touchedIds.add(existing.id);

                // Cek apakah ada perubahan (diff check)
                let isChanged = false;
                const changedFields = [];
                for (const [key, val] of Object.entries(recordData)) {
                    if (String(val ?? '') !== String(existing[key] ?? '')) {
                        isChanged = true;
                        changedFields.push(`${key}: "${String(existing[key] ?? '')}" -> "${String(val ?? '')}"`);
                    }
                }

                if (isChanged) {
                    console.log(`[server] UPDATE ${r.nama} (${existing.id}): ${changedFields.join(', ')}`);
                    
                    // Log version mismatch sebagai warning (tidak blocking)
                    // Normalisasi client vs server bisa menyebabkan false diff
                    if (r.version && existing.version && Number(r.version) !== Number(existing.version)) {
                        console.warn(`[server] Version mismatch for ${r.nama}: client=${r.version}, db=${existing.version}. Proceeding with update.`);
                    }

                    const nextVersion = (Number(existing.version) || 1) + 1;
                    const updatePayload = {
                        ...recordData,
                        version: nextVersion,
                    };

                    const { data: updated, error: uErr } = await supabaseAdmin
                        .from('personnel')
                        .update(updatePayload)
                        .eq('id', existing.id)
                        .select();

                    if (uErr) {
                        console.error(`[server] UPDATE ERROR for ${r.nama}:`, uErr);
                        throw uErr;
                    }
                    console.log(`[server] UPDATE OK for ${r.nama}, new version: ${nextVersion}`);
                    updateCount++;
                } else {
                    skipCount++;
                }
            } else {
                // INSERT record baru dengan auto-increment & retry loop jika terjadi bentrok kode
                let insertSuccess = false;
                let attempts = 0;
                while (!insertSuccess && attempts < 50) {
                    attempts++;
                    maxExistingNum++;
                    const newCode = `PRS-${String(maxExistingNum).padStart(4, '0')}`;
                    const insertData = {
                        ...recordData,
                        personnel_code: newCode,
                        is_published: false,
                        photo_is_public: false,
                        version: 1,
                    };

                    const { data: inserted, error: iErr } = await supabaseAdmin
                        .from('personnel')
                        .insert(insertData)
                        .select()
                        .single();

                    if (iErr) {
                        if (iErr.code === '23505') {
                            // Kode duplikat terdeteksi, coba angka berikutnya
                            continue;
                        }
                        throw iErr;
                    }
                    if (inserted) {
                        touchedIds.add(inserted.id);
                        insertSuccess = true;
                        insertCount++;
                        console.log(`[server] INSERT OK: ${r.nama} -> ${newCode} (${inserted.id})`);
                    }
                }
            }
        }

        // 2. SOFT DELETE untuk record yang dihapus
        for (const existing of currentDbRows) {
            if (!touchedIds.has(existing.id)) {
                console.log(`[server] Soft-deleting removed personnel: ${existing.name} (${existing.id})`);
                await supabaseAdmin
                    .from('personnel')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', existing.id);
            }
        }

        const now = Date.now();
        // Invalidate memory cache agar GET /api/data dan /api/stats mengambil data terbaru
        memCache.data = null;
        memCache.stats = null;
        memCache.awards = null;

        const deletedCount = currentDbRows.filter(r => !touchedIds.has(r.id)).length;
        console.log(`[server] SAVE SUMMARY: ${updateCount} updated, ${insertCount} inserted, ${skipCount} unchanged, ${deletedCount} deleted. Total sent: ${rows.length}`);

        res.json({
            ok: true,
            rows: rows.length,
            savedAt: new Date(now).toISOString(),
            mtime: now,
        });

    } catch (err) {
        console.error('[server] /api/save error:', err);
        res.status(500).json({ ok: false, error: 'Gagal menyimpan ke database: ' + err.message });
    }
});

// 4. POST /api/upload-photo - Upload foto personel ke disk lokal + simpan path ke DB
app.post('/api/upload-photo', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        const nama = String(req.body?.nama ?? '').trim();
        if (!nama) return res.status(400).json({ ok: false, error: 'Nama personel wajib diisi.' });
        if (!req.file) return res.status(400).json({ ok: false, error: 'Berkas foto tidak ditemukan.' });

        // Verifikasi magic bytes
        const buffer = req.file.buffer;
        const magicBytes = buffer.slice(0, 12);
        const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF;
        const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
        const isWebP = magicBytes[8] === 0x57 && magicBytes[9] === 0x45 && magicBytes[10] === 0x42 && magicBytes[11] === 0x50;
        const isGIF = magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46;

        if (!isJPEG && !isPNG && !isWebP && !isGIF) {
            return res.status(400).json({ ok: false, error: 'Format file tidak valid. Hanya JPEG, PNG, WebP, GIF.' });
        }

        const slug = slugify(nama);
        if (!slug) return res.status(400).json({ ok: false, error: 'Nama tidak valid untuk slug.' });

        fs.mkdirSync(PHOTO_DIR, { recursive: true });
        const filename = slug + '.webp';
        const destPath = path.join(PHOTO_DIR, filename);

        await sharp(buffer)
            .resize(400, 400, { fit: 'cover', position: 'top' })
            .webp({ quality: 80 })
            .toFile(destPath);

        const relativePath = 'assets/personel/' + filename;

        // Update photo_local_path di Postgres
        if (isDbConfigured()) {
            await supabaseAdmin
                .from('personnel')
                .update({ photo_local_path: relativePath })
                .ilike('name', `%${nama}%`);
        }

        memCache.data = null;
        memCache.stats = null;
        res.json({ ok: true, path: relativePath, filename });
    } catch (err) {
        console.error('[server] upload foto gagal:', err);
        res.status(500).json({ ok: false, error: 'Gagal memproses foto: ' + err.message });
    }
});

// 5. POST /api/rename-photo - Rename foto di disk lokal + update DB
app.post('/api/rename-photo', requireAuth, express.json(), async (req, res) => {
    try {
        const oldName = String(req.body?.oldName ?? '').trim();
        const newName = String(req.body?.newName ?? '').trim();
        if (!oldName || !newName) return res.status(400).json({ ok: false, error: 'oldName dan newName wajib diisi.' });

        const oldSlug = slugify(oldName);
        const newSlug = slugify(newName);
        if (oldSlug === newSlug) return res.json({ ok: true, renamed: false, message: 'Nama sama.' });

        const oldPath = path.join(PHOTO_DIR, oldSlug + '.webp');
        const newPath = path.join(PHOTO_DIR, newSlug + '.webp');

        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }

        const newRelativePath = 'assets/personel/' + newSlug + '.webp';

        // Rename berkas fisik di disk saja. Update path di DB dilakukan atomik oleh /api/save.
        memCache.data = null;
        res.json({ ok: true, renamed: true, newPath: newRelativePath });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Gagal rename foto.' });
    }
});

// 6. POST /api/save-awards - Simpan data penghargaan per record via FK personnel_id
app.post('/api/save-awards', requireAuth, async (req, res) => {
    try {
        const awards = req.body?.awards;
        const targetNama = req.body?.nama;
        if (!Array.isArray(awards)) return res.status(400).json({ ok: false, error: 'Body harus { awards: [...] }.' });

        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        // Ambil mapping nama -> id
        const { data: personnelList } = await supabaseAdmin
            .from('personnel')
            .select('id, name, district')
            .is('deleted_at', null);

        const personMap = new Map();
        (personnelList || []).forEach(p => {
            const key = slugify(stripNameTitles(p.name));
            personMap.set(key, p.id);
        });

        // Jika targetNama dikirim (save per-personel), bersihkan award lama milik personel ini
        if (targetNama) {
            const targetKey = slugify(stripNameTitles(targetNama));
            const pId = personMap.get(targetKey);
            if (pId) {
                await supabaseAdmin.from('awards').delete().eq('personnel_id', pId);
            }
        }

        const awardRows = [];
        for (const a of awards) {
            const nama = String(a.nama || a.Nama || targetNama || '').trim();
            const title = String(a.penghargaan || a.title || '').trim();
            if (!nama || !title) continue;

            const nameKey = slugify(stripNameTitles(nama));
            const personnelId = personMap.get(nameKey);
            if (!personnelId) {
                console.warn(`[awards] Warning: Personel tidak ditemukan untuk award: ${nama}`);
                continue;
            }

            awardRows.push({
                personnel_id: personnelId,
                title: title,
                category: a.kategori || null,
                issuer: a.issuer || null,
                proof_local_path: a.bukti || null,
                is_published: false,
            });
        }

        if (awardRows.length > 0) {
            const { error: batchErr } = await supabaseAdmin.from('awards').upsert(awardRows);
            if (batchErr) throw batchErr;
        }

        memCache.awards = null;
        memCache.data = null;
        res.json({ ok: true, count: awardRows.length, savedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[server] save awards error:', err);
        res.status(500).json({ ok: false, error: 'Gagal menyimpan penghargaan: ' + err.message });
    }
});

// 7. POST /api/upload-proof - Upload bukti penghargaan langsung ke Supabase Storage
app.post('/api/upload-proof', requireAuth, upload.single('proof'), async (req, res) => {
    try {
        const kabkota = String(req.body?.kabkota ?? '').trim();
        const nama = String(req.body?.nama ?? '').trim();
        if (!nama) return res.status(400).json({ ok: false, error: 'Nama personel wajib diisi.' });
        if (!req.file) return res.status(400).json({ ok: false, error: 'Berkas bukti tidak ditemukan.' });

        const regionSlug = slugify(kabkota) || 'unknown';
        const nameSlug = slugify(nama);
        const origExt = path.extname(req.file.originalname).toLowerCase() || '.pdf';
        const safeName = req.file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 100);
        const filename = safeName.endsWith(origExt) ? safeName : safeName + origExt;
        const objectPath = `${regionSlug}/${nameSlug}/${filename}`;

        // Kompres buffer (PDF / Gambar) secara otomatis untuk hemat penyimpanan Supabase
        const uploadBuffer = await compressProofBuffer(req.file.buffer, filename);

        // Simpan juga salinan lokal sebagai backup
        try {
            const destDir = path.join(AWARDS_DIR, regionSlug, nameSlug);
            fs.mkdirSync(destDir, { recursive: true });
            fs.writeFileSync(path.join(destDir, filename), uploadBuffer);
        } catch (backupErr) {
            console.warn('[upload-proof] Gagal menyimpan backup lokal:', backupErr.message);
        }

        // Unggah ke Supabase Storage bucket award-proofs
        const { error: upErr } = await supabaseAdmin.storage
            .from('award-proofs')
            .upload(objectPath, uploadBuffer, {
                contentType: req.file.mimetype || 'application/pdf',
                upsert: true,
            });

        if (upErr) {
            console.error('[upload-proof] Supabase Storage upload error:', upErr);
            throw upErr;
        }

        const { data: storageData } = supabaseAdmin.storage
            .from('award-proofs')
            .getPublicUrl(objectPath);

        const publicUrl = storageData?.publicUrl || objectPath;

        res.json({
            ok: true,
            path: publicUrl,
            objectPath,
            filename
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Gagal mengunggah bukti ke Supabase Storage: ' + err.message });
    }
});

app.use((req, res) => res.status(404).type('text/plain').send('404 Not Found'));

app.use((err, req, res, next) => {
    console.error('[server error]', err);
    res.status(500).json({ ok: false, error: 'Terjadi kesalahan di server.' });
});

app.listen(PORT, HOST, () => {
    console.log(`Server berjalan di http://${HOST}:${PORT}`);
    console.log(`Mode database: ${isDbConfigured() ? 'Supabase Postgres (schema: api)' : 'Fallback / Unconfigured'}`);
});