/**
 * Lapisan akses data: mengambil berkas Excel, mem-parsing, menormalkan,
 * memvalidasi, dan menyimpan cache. Tidak ada satu pun operasi DOM di sini.
 */
import { APP_CONFIG } from './config.js';
import {
    mapHeader,
    headerScore,
    normalizeRecord,
    validateRecord,
    findDuplicates,
    assignStableIds,
} from './schema.js';

class DataError extends Error {
    constructor(message, hint) {
        super(message);
        this.name = 'DataError';
        this.hint = hint;
    }
}

function buildColumnMap(headerRow, subHeaderRow) {
    const maxCols = Math.max(headerRow.length, subHeaderRow ? subHeaderRow.length : 0);
    let ordinalSeen = 0;
    return Array.from({ length: maxCols }).map((_, c) => {
        const combined = [headerRow[c], subHeaderRow ? subHeaderRow[c] : '']
            .map((v) => String(v ?? '').trim())
            .filter(Boolean)
            .join(' ');
        const key = mapHeader(combined);
        if (key === '__ORDINAL__') {
            ordinalSeen += 1;
            return ordinalSeen === 1 ? 'no' : 'noUrut';
        }
        return key;
    });
}

function gridToRaw(grid) {
    if (!grid.length) throw new DataError('Sheet kosong.', 'Pastikan sheet pertama berisi data.');

    const scanTo = Math.min(grid.length, APP_CONFIG.dataSource.headerScanRows);
    let headerIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < scanTo; i += 1) {
        const score = headerScore(grid[i]);
        if (score > bestScore) {
            bestScore = score;
            headerIndex = i;
        }
    }
    if (bestScore < 3) {
        throw new DataError(
            'Baris header tidak dikenali.',
            'Pastikan baris judul memuat kolom seperti NAMA, PROVINSI, JABATAN.'
        );
    }

    // BUG LAMA: sub-header (mis. "MEDIA SOSIAL" -> FACEBOOK | INSTAGRAM) dipakai
    // untuk memetakan kolom, TETAPI baris data tetap dimulai dari headerIndex + 1,
    // sehingga baris sub-header itu sendiri ikut masuk sebagai data.
    const nextRow = Array.isArray(grid[headerIndex + 1]) ? grid[headerIndex + 1] : null;
    const baseMap = buildColumnMap(grid[headerIndex], null);
    const namaCol = baseMap.indexOf('nama');
    const nextNama = nextRow && namaCol >= 0 ? String(nextRow[namaCol] ?? '').trim() : '';
    const isSubHeader = Boolean(nextRow) && headerScore(nextRow) >= 2 && (!nextNama || mapHeader(nextNama) !== null);

    const columnMap = buildColumnMap(grid[headerIndex], isSubHeader ? nextRow : null);
    const firstDataRow = headerIndex + (isSubHeader ? 2 : 1);

    const rows = [];
    for (let i = firstDataRow; i < grid.length; i += 1) {
        const cells = grid[i];
        const obj = { __row: i + 1 };
        let hasValue = false;
        columnMap.forEach((key, c) => {
            if (!key) return;
            const v = cells[c];
            obj[key] = v;
            if (String(v ?? '').trim() !== '') hasValue = true;
        });
        if (hasValue && String(obj.nama ?? '').trim() !== '') rows.push(obj);
    }

    const recognized = columnMap.filter(Boolean).length;
    return {
        rows,
        meta: { headerIndex, subHeaderUsed: isSubHeader, recognized, totalColumns: columnMap.length },
    };
}

/**
 * CATATAN KEAMANAN: base64 di bawah ini HANYA menyulitkan pembacaan sekilas.
 * Ini BUKAN enkripsi dan tidak melindungi PII dari ekstensi browser atau
 * pengguna yang punya akses ke perangkat. Perlindungan sebenarnya harus di
 * lapisan server (HTTPS + autentikasi). Klaim di README perlu dikoreksi.
 */
const CACHE_VERSION = 5;
const cacheKey = () => APP_CONFIG.cache.key + ':v' + CACHE_VERSION + ':' + APP_CONFIG.dataSource.url;

function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function readCache() {
    if (!APP_CONFIG.cache.enabled) return null;
    const key = cacheKey();
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const blob = JSON.parse(fromBase64(raw));
        const ageMin = (Date.now() - (blob?.cachedAt ?? 0)) / 60000;
        if (!blob || ageMin > APP_CONFIG.cache.ttlMinutes) {
            sessionStorage.removeItem(key); // jangan tinggalkan PII basi
            return null;
        }
        return blob;
    } catch {
        sessionStorage.removeItem(key);
        return null;
    }
}

function writeCache(payload) {
    if (!APP_CONFIG.cache.enabled) return;
    try {
        sessionStorage.setItem(cacheKey(), toBase64(JSON.stringify({ ...payload, cachedAt: Date.now() })));
    } catch {
        /* kuota sessionStorage penuh atau diblokir — abaikan, cache bersifat opsional */
    }
}

/** Dipanggil tombol "Muat Ulang Data" agar cache benar-benar bersih. */
export function clearDatasetCache() {
    try {
        sessionStorage.removeItem(cacheKey());
    } catch {
        /* diabaikan */
    }
}

export async function loadDataset({ force = false } = {}) {
    if (!force) {
        const cached = readCache();
        if (cached) return { ...cached, fromCache: true };
    }

    const url = '/api/data' + (force ? '?t=' + Date.now() : '');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;

    let response;
    try {
        response = await fetch(url, { cache: force ? 'reload' : 'default', signal: controller?.signal });
    } catch (err) {
        throw new DataError(
            err?.name === 'AbortError' ? 'Pengambilan data melebihi batas waktu.' : 'Tidak dapat mengambil data.',
            'Halaman ini harus dijalankan lewat HTTP server (npm run dev), bukan dibuka langsung dari file://.'
        );
    } finally {
        if (timeout) clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new DataError(
            'Berkas data tidak ditemukan (HTTP ' + response.status + ').',
            'Pastikan server backend berjalan dengan baik.'
        );
    }

    const resJson = await response.json();
    if (!resJson.ok || !resJson.data) {
        throw new DataError('Format data dari server tidak valid.', 'Hubungi administrator.');
    }

    const { grid, sheetName, lastModified, mtime } = resJson.data;
    
    if (!grid || !Array.isArray(grid)) {
        throw new DataError('Grid data kosong.', 'Pastikan file Excel memiliki data.');
    }

    const { rows, meta } = gridToRaw(grid);

    const cc = APP_CONFIG.ui.defaultCountryCode;
    const records = assignStableIds(rows.map((raw, i) => normalizeRecord(raw, i, cc)));
    const issues = [...records.flatMap(validateRecord), ...findDuplicates(records)];

    const payload = {
        records,
        issues,
        mtime: mtime || Date.now(), // <-- Simpan mtime untuk optimistic concurrency
        meta: {
            ...meta,
            sheetName,
            rowCount: records.length,
            lastModified: lastModified,
            loadedAt: new Date().toISOString(),
            sourceUrl: '/api/data',
            unmappedColumns: meta.totalColumns - meta.recognized,
        },
    };
    writeCache(payload);
    return { ...payload, fromCache: false };
}
