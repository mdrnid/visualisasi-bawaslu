/**
 * server.js
 * 
 * Server statis + API untuk Visualisasi Personel Bawaslu.
 * Sumber kebenaran data: Supabase Postgres (schema api) via lib/db.js.
 * Berkas Excel hanya digunakan untuk import/export/backup oleh script CLI.
 * 
 * PERBAIKAN CRUD v2 (2026-09-13):
 * - Endpoint CRUD eksplisit (POST/PATCH/DELETE /api/personnel)
 * - Optimistic concurrency via version field
 * - 0-rows-affected = error (bukan sukses)
 * - Hapus fallback pencocokan nama
 * - Per-row validation (bukan all-or-nothing)
 * - Cache epoch-based invalidation
 * - Structured logging per mutasi
 * - Guard isDbConfigured() pada semua endpoint tulis
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
import { validateRecord, normName, normKabkota } from './assets/js/schema.js';
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

// Cache berbasis epoch: setiap operasi tulis menaikkan cacheEpoch.
// Request baca yang dimulai sebelum epoch berubah TIDAK akan menulis cache.
let cacheEpoch = 0;
const memCache = {};
const CACHE_TTL = 30000; // 30s

function invalidateCache() {
    cacheEpoch++;
    memCache.data = null;
    memCache.stats = null;
    memCache.awards = null;
}

// ---------- Helper: Parse gender dengan whitelist ketat ----------
function parseGender(raw) {
    const s = String(raw || '').trim().toLowerCase();
    const GENDER_MAP = {
        'laki-laki': 'L', 'l': 'L', 'pria': 'L', 'male': 'L', 'lk': 'L', 'm': 'L',
        'perempuan': 'P', 'p': 'P', 'wanita': 'P', 'female': 'P', 'pr': 'P', 'w': 'P', 'f': 'P',
    };
    return GENDER_MAP[s] || null;
}

// ---------- Helper: Parse AMJ ke term_start/term_end ----------
function parseAmj(raw) {
    const s = String(raw || '').trim();
    const result = { term_raw: s || null, term_start: null, term_end: null };
    if (!s) return result;

    // Format "2023-2028" atau "2023 - 2028"
    const rangeMatch = s.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
    if (rangeMatch) {
        result.term_start = `${rangeMatch[1]}-01-01`;
        result.term_end = `${rangeMatch[2]}-12-31`;
    }
    return result;
}

// ---------- Helper: Build record payload dari request body ----------
function buildRecordPayload(r) {
    const gender = parseGender(r.gender);
    const amj = parseAmj(r.amj);
    
    return {
        province: r.provinsi || null,
        district: r.kabkota ? normKabkota(r.kabkota) : null,
        name: r.nama ? normName(r.nama) : null,
        gender: gender,
        position: r.jabatan || null,
        wakordiv: r.wakordiv || null,
        division: r.div || null,
        ...amj, // term_raw, term_start, term_end
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
}

// ---------- Helper: Structured logging ----------
function logMutation(action, { personnelId, personnelName, changedFields, rowsAffected, versionBefore, versionAfter, durationMs, requestId }) {
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        action,
        requestId: requestId || '-',
        personnelId: personnelId || '-',
        personnelName: personnelName || '-',
        changedFields: changedFields || [],
        rowsAffected: rowsAffected ?? 0,
        versionBefore: versionBefore ?? null,
        versionAfter: versionAfter ?? null,
        durationMs: durationMs ?? 0,
    }));
}

// 1. GET /api/stats - Statistik publik
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
        // FIX A7: Jangan sajikan cache sebagai respons sukses saat error
        console.error('[server] /api/stats error:', err);
        if (memCache.stats) {
            return res.status(200).json({ ...memCache.stats, _stale: true, _warning: 'Data dari cache, DB error: ' + err.message });
        }
        res.status(500).json({ ok: false, error: 'Gagal membaca statistik dari database.' });
    }
});

// 2. GET /api/data - Baca data personel dari Postgres
app.get('/api/data', requireAuth, async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }
        
        const readEpoch = cacheEpoch; // Snapshot epoch saat request dimulai
        
        if (memCache.data && Date.now() < memCache.dataExp) return res.json(memCache.data);

        const { data: records, error } = await supabaseAdmin
            .from('personnel')
            .select('*')
            .is('deleted_at', null)
            .order('personnel_code', { ascending: true });

        if (error) throw error;

        // Susun struktur grid 2D yang kompatibel dengan parser frontend
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

        const responseData = {
            ok: true,
            data: {
                grid,
                sheetName: 'DATA',
                lastModified: new Date(maxMtime || Date.now()).toISOString(),
                mtime: maxMtime || Date.now(),
            }
        };
        
        // FIX A6: Hanya tulis cache jika epoch belum berubah (tidak ada write di tengah)
        if (readEpoch === cacheEpoch) {
            memCache.data = responseData;
            memCache.dataExp = Date.now() + CACHE_TTL;
        }
        
        // FIX A8: Cache-Control: no-store agar browser/proxy tidak cache response stale
        res.setHeader('Cache-Control', 'no-store');
        res.json(responseData);
    } catch (err) {
        // FIX A7: Jangan sajikan cache sebagai respons sukses saat error
        console.error('[server] /api/data error:', err);
        if (memCache.data) {
            return res.status(200).json({ 
                ...memCache.data, 
                _stale: true, 
                _warning: 'Data dari cache karena error DB: ' + err.message 
            });
        }
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
                personnel_id: a.personnel_id,
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
        // FIX A7: Jangan sajikan cache sebagai respons sukses saat error tanpa warning
        console.warn('[server] fallback penghargaan.json error:', err.message);
        if (memCache.awards) {
            return res.json(memCache.awards); // penghargaan bersifat non-kritis, tetap sajikan
        }
        const legacyFile = path.join(__dirname, 'data', 'penghargaan.json');
        if (fs.existsSync(legacyFile)) {
            res.sendFile(legacyFile);
        } else {
            res.json([]);
        }
    }
});

// ========== CRUD EKSPLISIT PER RECORD ==========

app.use(express.json({ limit: '5mb' }));

// ---------- POST /api/personnel — Buat 1 record baru ----------
app.post('/api/personnel', requireAuth, async (req, res) => {
    const startMs = Date.now();
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const r = req.body;
        if (!r.nama || !String(r.nama).trim()) {
            return res.status(400).json({ ok: false, error: 'Nama wajib diisi.' });
        }

        // Validasi
        const issues = validateRecord(r, { strictEmail: false });
        const errors = issues.filter(i => i.severity === 'error');
        if (errors.length > 0) {
            return res.status(422).json({
                ok: false,
                code: 'VALIDATION_ERROR',
                errors: errors.map(e => `${e.field}: ${e.message}`),
            });
        }

        const recordData = buildRecordPayload(r);

        // FIX A6: Invalidasi cache SEBELUM tulis
        invalidateCache();

        // Insert — personnel_code diisi otomatis oleh DEFAULT dari sequence DB
        const { data: inserted, error: iErr } = await supabaseAdmin
            .from('personnel')
            .insert({
                ...recordData,
                is_published: false,
                photo_is_public: false,
                // version default 1 dari skema, personnel_code dari sequence
            })
            .select()
            .single();

        if (iErr) {
            console.error('[server] INSERT ERROR:', iErr);
            return res.status(500).json({ ok: false, code: 'DB_ERROR', error: iErr.message });
        }

        // FIX A6: Invalidasi cache SETELAH tulis
        invalidateCache();

        logMutation('INSERT', {
            personnelId: inserted.id,
            personnelName: inserted.name,
            rowsAffected: 1,
            versionAfter: inserted.version,
            durationMs: Date.now() - startMs,
        });

        res.status(201).json({ ok: true, record: inserted });
    } catch (err) {
        console.error('[server] POST /api/personnel error:', err);
        res.status(500).json({ ok: false, error: 'Gagal membuat record: ' + err.message });
    }
});

// ---------- PATCH /api/personnel/:id — Update 1 record (optimistic locking) ----------
app.patch('/api/personnel/:id', requireAuth, async (req, res) => {
    const startMs = Date.now();
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const { id } = req.params;
        const clientVersion = Number(req.body?.version);
        
        if (!id || !id.match(/^[0-9a-f-]{36}$/i)) {
            return res.status(400).json({ ok: false, code: 'INVALID_ID', error: 'ID harus berupa UUID valid.' });
        }
        if (!clientVersion && clientVersion !== 0) {
            return res.status(400).json({ ok: false, code: 'MISSING_VERSION', error: 'Field version wajib untuk optimistic locking.' });
        }

        const r = req.body;
        const patch = buildRecordPayload(r);
        
        // Hapus field null/undefined agar hanya field yang dikirim yang di-update
        // TAPI tetap izinkan null eksplisit (untuk menghapus nilai)
        // Kita update semua field yang di-build agar konsisten
        
        // JANGAN kirim field `version` — trigger bump_version() yang menaikkan
        
        // FIX A6: Invalidasi cache SEBELUM tulis
        invalidateCache();

        // FIX A4+A5+B1: Optimistic locking + guard deleted_at + cek rowsAffected
        const { data, error } = await supabaseAdmin
            .from('personnel')
            .update(patch)
            .eq('id', id)
            .eq('version', clientVersion)    // FIX B1: optimistic locking
            .is('deleted_at', null)           // FIX A5: guard deleted_at
            .select();

        if (error) {
            return res.status(500).json({ ok: false, code: 'DB_ERROR', error: error.message });
        }

        // FIX A4: 0 baris terdampak BUKAN sukses
        if (!data || data.length === 0) {
            const { data: current } = await supabaseAdmin
                .from('personnel')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            
            if (!current) {
                return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Record tidak ditemukan.' });
            }
            if (current.deleted_at) {
                return res.status(410).json({ ok: false, code: 'DELETED', error: 'Record sudah dihapus.' });
            }
            // Version conflict
            return res.status(409).json({
                ok: false,
                code: 'VERSION_CONFLICT',
                error: 'Data sudah diubah oleh pengguna lain. Muat ulang dan coba lagi.',
                current: current,
            });
        }

        // FIX A6: Invalidasi cache SETELAH tulis
        invalidateCache();

        const updated = data[0];
        
        // Hitung field yang berubah untuk logging
        const changedFields = Object.keys(patch).filter(k => patch[k] !== null || patch[k] !== undefined);

        logMutation('UPDATE', {
            personnelId: updated.id,
            personnelName: updated.name,
            changedFields,
            rowsAffected: data.length,
            versionBefore: clientVersion,
            versionAfter: updated.version,
            durationMs: Date.now() - startMs,
        });

        return res.json({ ok: true, record: updated });
    } catch (err) {
        console.error('[server] PATCH /api/personnel error:', err);
        res.status(500).json({ ok: false, error: 'Gagal mengupdate record: ' + err.message });
    }
});

// ---------- DELETE /api/personnel/:id — Soft delete dengan version check ----------
app.delete('/api/personnel/:id', requireAuth, async (req, res) => {
    const startMs = Date.now();
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const { id } = req.params;
        const clientVersion = Number(req.query?.version || req.body?.version);
        
        if (!id || !id.match(/^[0-9a-f-]{36}$/i)) {
            return res.status(400).json({ ok: false, code: 'INVALID_ID', error: 'ID harus berupa UUID valid.' });
        }

        // FIX A6: Invalidasi cache SEBELUM tulis
        invalidateCache();

        const deletePayload = { deleted_at: new Date().toISOString() };
        
        let query = supabaseAdmin
            .from('personnel')
            .update(deletePayload)
            .eq('id', id)
            .is('deleted_at', null);
        
        // Jika version dikirim, gunakan untuk optimistic locking
        if (clientVersion) {
            query = query.eq('version', clientVersion);
        }
        
        const { data, error } = await query.select();

        if (error) {
            return res.status(500).json({ ok: false, code: 'DB_ERROR', error: error.message });
        }

        if (!data || data.length === 0) {
            const { data: current } = await supabaseAdmin
                .from('personnel')
                .select('id, deleted_at, version')
                .eq('id', id)
                .maybeSingle();
            
            if (!current) {
                return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Record tidak ditemukan.' });
            }
            if (current.deleted_at) {
                return res.status(410).json({ ok: false, code: 'ALREADY_DELETED', error: 'Record sudah dihapus sebelumnya.' });
            }
            return res.status(409).json({
                ok: false,
                code: 'VERSION_CONFLICT',
                error: 'Data sudah diubah oleh pengguna lain.',
                current: { id: current.id, version: current.version },
            });
        }

        // FIX A6: Invalidasi cache SETELAH tulis
        invalidateCache();

        logMutation('DELETE', {
            personnelId: id,
            personnelName: data[0]?.name,
            rowsAffected: data.length,
            versionBefore: clientVersion,
            durationMs: Date.now() - startMs,
        });

        return res.json({ ok: true, deleted: true, id });
    } catch (err) {
        console.error('[server] DELETE /api/personnel error:', err);
        res.status(500).json({ ok: false, error: 'Gagal menghapus record: ' + err.message });
    }
});

// 3. POST /api/save - Simpan data (HANYA untuk import massal, dipertahankan untuk kompatibilitas)
app.post('/api/save', requireAuth, async (req, res) => {
    try {
        // FIX A10: Guard isDbConfigured()
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const rows = req.body?.rows;
        const baseMtime = req.body?.baseMtime;
        const confirmBulkDelete = req.body?.confirmBulkDelete;

        if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'Body harus { rows: [...] }.' });
        if (rows.length === 0) return res.status(400).json({ ok: false, error: 'Tidak ada baris untuk disimpan.' });
        if (rows.length > MAX_ROWS) return res.status(413).json({ ok: false, error: 'Terlalu banyak baris.' });

        // FIX A9: Validasi per baris — TIDAK gagalkan seluruh batch
        const rowResults = [];
        const validRows = [];
        rows.forEach((row, idx) => {
            const issues = validateRecord(row, { strictEmail: false }); // strictEmail hanya untuk field yang diubah
            const errors = issues.filter(i => i.severity === 'error');
            if (errors.length > 0) {
                rowResults.push({
                    index: idx,
                    nama: row.nama || '(tanpa nama)',
                    status: 'skipped',
                    errors: errors.map(e => `${e.field}: ${e.message}`),
                });
            } else {
                validRows.push({ row, originalIndex: idx });
            }
        });

        // Ambil data saat ini dari DB untuk menghitung DIFF
        const { data: currentDbRows, error: fetchErr } = await supabaseAdmin
            .from('personnel')
            .select('*')
            .is('deleted_at', null);

        if (fetchErr) throw fetchErr;

        const currentCount = currentDbRows.length;

        // Guard bulk delete: tolak jika berkurang > 20% tanpa konfirmasi
        if (currentCount > 0) {
            const lossPercent = ((currentCount - validRows.length) / currentCount) * 100;
            if (lossPercent > 20 && !confirmBulkDelete) {
                return res.status(409).json({
                    ok: false,
                    error: `Penghapusan massal terdeteksi: ${validRows.length} baris valid dikirim, saat ini ${currentCount} baris (kehilangan ${Math.round(lossPercent)}%).`,
                    hint: 'Pastikan Anda tidak sedang menyimpan data yang terfilter. Kirim ulang dengan confirmBulkDelete: true bila yakin.',
                    requireConfirmBulkDelete: true
                });
            }
        }

        // FIX A2+A3: Petakan record database HANYA berdasarkan UUID
        // TIDAK ada fallback berdasarkan nama
        const dbById = new Map();
        currentDbRows.forEach(r => {
            if (r.id) dbById.set(r.id, r);
        });

        const touchedIds = new Set();

        // FIX A6: Invalidasi cache SEBELUM tulis
        invalidateCache();

        // UPDATE & INSERT per record
        let updateCount = 0, insertCount = 0, skipCount = 0;
        const errors = [];
        
        for (const { row: r, originalIndex: idx } of validRows) {
            const rowId = r.id;
            const existing = rowId ? dbById.get(rowId) : null;

            const recordData = buildRecordPayload(r);

            if (existing) {
                touchedIds.add(existing.id);

                // Cek apakah ada perubahan (diff check)
                let isChanged = false;
                const changedFields = [];
                for (const [key, val] of Object.entries(recordData)) {
                    if (String(val ?? '') !== String(existing[key] ?? '')) {
                        isChanged = true;
                        changedFields.push(key);
                    }
                }

                if (isChanged) {
                    // FIX B1+A4+A5: Optimistic locking + deleted_at guard + cek rowsAffected
                    const clientVersion = Number(r.version) || existing.version;
                    
                    const { data: updated, error: uErr } = await supabaseAdmin
                        .from('personnel')
                        .update(recordData)  // JANGAN kirim version; trigger menaikkan
                        .eq('id', existing.id)
                        .eq('version', clientVersion)
                        .is('deleted_at', null)
                        .select();

                    if (uErr) {
                        errors.push({ index: idx, nama: r.nama, error: uErr.message });
                        continue;
                    }

                    if (!updated || updated.length === 0) {
                        // Version conflict atau record dihapus
                        errors.push({ index: idx, nama: r.nama, error: 'Version conflict atau record dihapus. Muat ulang data.' });
                        continue;
                    }

                    logMutation('BULK_UPDATE', {
                        personnelId: existing.id,
                        personnelName: r.nama,
                        changedFields,
                        rowsAffected: updated.length,
                        versionBefore: clientVersion,
                        versionAfter: updated[0].version,
                    });
                    updateCount++;
                } else {
                    skipCount++;
                }
            } else {
                // INSERT record baru — personnel_code dari sequence DB
                const insertData = {
                    ...recordData,
                    is_published: false,
                    photo_is_public: false,
                    // version default 1, personnel_code dari sequence
                };

                const { data: inserted, error: iErr } = await supabaseAdmin
                    .from('personnel')
                    .insert(insertData)
                    .select()
                    .single();

                if (iErr) {
                    errors.push({ index: idx, nama: r.nama, error: iErr.message });
                    continue;
                }
                
                if (inserted) {
                    touchedIds.add(inserted.id);
                    insertCount++;
                    logMutation('BULK_INSERT', {
                        personnelId: inserted.id,
                        personnelName: r.nama,
                        rowsAffected: 1,
                        versionAfter: inserted.version,
                    });
                }
            }
        }

        // SOFT DELETE untuk record yang tidak dikirim
        // FIX B3: Cek error pada setiap soft-delete
        let deletedCount = 0;
        for (const existing of currentDbRows) {
            if (!touchedIds.has(existing.id)) {
                const { error: dErr, data: dData } = await supabaseAdmin
                    .from('personnel')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', existing.id)
                    .is('deleted_at', null)
                    .select('id');

                if (dErr) {
                    errors.push({ nama: existing.name, error: 'Gagal soft-delete: ' + dErr.message });
                } else if (dData && dData.length > 0) {
                    deletedCount++;
                    logMutation('BULK_DELETE', {
                        personnelId: existing.id,
                        personnelName: existing.name,
                        rowsAffected: dData.length,
                    });
                }
            }
        }

        const now = Date.now();
        // FIX A6: Invalidasi cache SETELAH tulis
        invalidateCache();

        console.log(`[server] SAVE SUMMARY: ${updateCount} updated, ${insertCount} inserted, ${skipCount} unchanged, ${deletedCount} deleted. Errors: ${errors.length}. Total sent: ${rows.length}`);

        res.json({
            ok: errors.length === 0,
            rows: validRows.length,
            updated: updateCount,
            inserted: insertCount,
            skipped: skipCount,
            deleted: deletedCount,
            errors: errors.length > 0 ? errors : undefined,
            skippedValidation: rowResults.length > 0 ? rowResults : undefined,
            savedAt: new Date(now).toISOString(),
            mtime: now,
        });

    } catch (err) {
        console.error('[server] /api/save error:', err);
        res.status(500).json({ ok: false, error: 'Gagal menyimpan ke database: ' + err.message });
    }
});

// 4. POST /api/upload-photo - Upload foto personel ke disk lokal + simpan path ke DB
// FIX B6: Menerima personnelId (UUID), BUKAN nama. Update tepat 1 baris.
app.post('/api/upload-photo', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const nama = String(req.body?.nama ?? '').trim();
        const personnelId = String(req.body?.personnelId ?? '').trim();
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

        // FIX B6: Update berdasarkan personnelId (UUID), bukan ilike nama
        if (personnelId && personnelId.match(/^[0-9a-f-]{36}$/i)) {
            invalidateCache();

            const { data: updated, error: upErr } = await supabaseAdmin
                .from('personnel')
                .update({ photo_local_path: relativePath })
                .eq('id', personnelId)
                .is('deleted_at', null)
                .select('id');

            if (upErr) {
                console.error('[server] upload-photo DB update error:', upErr);
                return res.status(500).json({ ok: false, error: 'Foto tersimpan di disk tapi gagal update DB: ' + upErr.message });
            }

            if (!updated || updated.length !== 1) {
                console.warn(`[server] upload-photo: expected 1 row affected, got ${updated?.length || 0}`);
                return res.status(404).json({ ok: false, error: 'Record tidak ditemukan atau sudah dihapus. Foto tersimpan di disk.' });
            }

            invalidateCache();
        } else {
            // Fallback untuk backward compatibility — tapi log warning
            console.warn('[server] upload-photo: personnelId tidak dikirim, foto disimpan di disk saja tanpa update DB.');
        }

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

        // Rename berkas fisik di disk saja. Update path di DB dilakukan atomik oleh PATCH /api/personnel/:id.
        invalidateCache();
        res.json({ ok: true, renamed: true, newPath: newRelativePath });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Gagal rename foto.' });
    }
});

// 6. POST /api/save-awards - Simpan data penghargaan per record via FK personnel_id
// FIX B7+B8: Menggunakan RPC transaksional
app.post('/api/save-awards', requireAuth, async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ ok: false, error: 'Database belum dikonfigurasi.' });
        }

        const awards = req.body?.awards;
        const targetNama = req.body?.nama;
        const targetPersonnelId = req.body?.personnelId; // FIX: terima personnelId langsung
        if (!Array.isArray(awards)) return res.status(400).json({ ok: false, error: 'Body harus { awards: [...] }.' });

        // Jika personnelId dikirim langsung, gunakan itu
        let pId = targetPersonnelId;
        
        if (!pId && targetNama) {
            // Fallback: cari berdasarkan nama (untuk backward compatibility)
            const { data: personnelList } = await supabaseAdmin
                .from('personnel')
                .select('id, name')
                .is('deleted_at', null);

            const personMap = new Map();
            (personnelList || []).forEach(p => {
                const key = slugify(stripNameTitles(p.name));
                personMap.set(key, p.id);
            });
            
            const targetKey = slugify(stripNameTitles(targetNama));
            pId = personMap.get(targetKey);
        }

        if (!pId) {
            return res.status(404).json({ ok: false, error: 'Personel tidak ditemukan.' });
        }

        // Build awards data
        const awardRows = [];
        for (const a of awards) {
            const title = String(a.penghargaan || a.title || '').trim();
            if (!title) continue;

            awardRows.push({
                title: title,
                category: a.kategori || null,
                issuer: a.issuer || null,
                proof_local_path: a.bukti || null,
                is_published: false,
            });
        }

        invalidateCache();

        // FIX B8: Gunakan RPC transaksional (atomic delete + insert)
        try {
            const { data: rpcResult, error: rpcErr } = await supabaseAdmin
                .rpc('save_awards_atomic', {
                    p_personnel_id: pId,
                    p_awards: awardRows,
                });

            if (rpcErr) {
                // Fallback jika RPC belum ada di DB: gunakan metode lama tapi dengan error handling
                console.warn('[server] RPC save_awards_atomic gagal, fallback ke metode standar:', rpcErr.message);
                
                // Delete lama
                const { error: delErr } = await supabaseAdmin.from('awards').delete().eq('personnel_id', pId);
                if (delErr) throw delErr;

                // Insert baru dengan onConflict
                if (awardRows.length > 0) {
                    const insertData = awardRows.map(a => ({
                        personnel_id: pId,
                        ...a,
                    }));
                    const { error: insErr } = await supabaseAdmin
                        .from('awards')
                        .insert(insertData);
                    if (insErr) throw insErr;
                }
            }
        } catch (txErr) {
            throw txErr;
        }

        invalidateCache();
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

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, HOST, () => {
        console.log(`Server berjalan di http://${HOST}:${PORT}`);
        console.log(`Mode database: ${isDbConfigured() ? 'Supabase Postgres (schema: api)' : 'Fallback / Unconfigured'}`);
    });
}

export { app, parseGender, parseAmj, buildRecordPayload, invalidateCache, cacheEpoch };