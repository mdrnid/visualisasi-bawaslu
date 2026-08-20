/**
 * Lapisan akses data: mengambil berkas Excel, mem-parsing, menormalkan,
 * memvalidasi, dan menyimpan cache. Tidak ada satu pun operasi DOM di sini.
 */
import { APP_CONFIG } from './config.js';
import { mapHeader, headerScore, normalizeRecord, validateRecord, findDuplicates } from './schema.js';

class DataError extends Error {
    constructor(message, hint) {
        super(message);
        this.name = 'DataError';
        this.hint = hint;
    }
}

/** Ubah matriks sel menjadi objek mentah berdasarkan baris header terbaik. */
function gridToRaw(grid) {
    if (!grid.length) throw new DataError('Sheet kosong.', 'Pastikan sheet pertama berisi data.');

    const scanTo = Math.min(grid.length, APP_CONFIG.dataSource.headerScanRows);
    let headerIndex = 0,
        bestScore = -1;
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

    let ordinalSeen = 0;
    const maxCols = Math.max(grid[headerIndex].length, grid[headerIndex + 1]?.length || 0);
    const columnMap = Array.from({ length: maxCols }).map((_, c) => {
        // Gabungkan baris header saat ini dengan baris di bawahnya untuk menangani header yang di-merge (seperti Media Sosial)
        const h = grid[headerIndex][c];
        const subH = grid[headerIndex + 1] && grid[headerIndex + 1][c];
        const combinedH = [h, subH].filter(Boolean).join(' ');

        const key = mapHeader(combinedH);
        if (key === '__ORDINAL__') {
            ordinalSeen += 1;
            return ordinalSeen === 1 ? 'no' : 'noUrut';
        }
        return key;
    });

    const rows = [];
    for (let i = headerIndex + 1; i < grid.length; i += 1) {
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
    return { rows, meta: { headerIndex, recognized, totalColumns: maxCols } };
}

function readCache() {
    if (!APP_CONFIG.cache.enabled) return null;
    try {
        const raw = sessionStorage.getItem(APP_CONFIG.cache.key);
        if (!raw) return null;
        // Obfuscate to prevent casual scraping of PII from console/extensions
        const decoded = decodeURIComponent(escape(atob(raw)));
        const blob = JSON.parse(decoded);
        if (!blob) return null;
        const ageMin = (Date.now() - blob.cachedAt) / 60000;
        if (ageMin > APP_CONFIG.cache.ttlMinutes) return null;
        return blob;
    } catch {
        return null;
    }
}

function writeCache(payload) {
    if (!APP_CONFIG.cache.enabled) return;
    try {
        const dataStr = JSON.stringify({ ...payload, cachedAt: Date.now() });
        const encoded = btoa(unescape(encodeURIComponent(dataStr)));
        sessionStorage.setItem(APP_CONFIG.cache.key, encoded);
    } catch {
        /* session storage quota full or blocked */
    }
}

/**
 * Memuat dataset dari sumber yang dikonfigurasi.
 * @param {{force?: boolean}} options
 */
export async function loadDataset({ force = false } = {}) {
    if (!force) {
        const cached = readCache();
        if (cached) return { ...cached, fromCache: true };
    }

    const url = APP_CONFIG.dataSource.url + (force ? '?t=' + Date.now() : '');
    let response;
    try {
        response = await fetch(url, { cache: force ? 'reload' : 'default' });
    } catch {
        throw new DataError(
            'Tidak dapat mengambil berkas data.',
            'Halaman ini harus dijalankan lewat HTTP server (mis. "npx serve"), bukan dibuka langsung dari file://.'
        );
    }
    if (!response.ok) {
        throw new DataError(
            'Berkas data tidak ditemukan (HTTP ' + response.status + ').',
            'Pastikan berkas tersimpan di ' + APP_CONFIG.dataSource.url + '.'
        );
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName =
        typeof APP_CONFIG.dataSource.sheet === 'number'
            ? workbook.SheetNames[APP_CONFIG.dataSource.sheet]
            : APP_CONFIG.dataSource.sheet;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new DataError('Sheet "' + sheetName + '" tidak ada.', 'Periksa dataSource.sheet di config.js.');

    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '', raw: false });
    const { rows, meta } = gridToRaw(grid);

    const cc = APP_CONFIG.ui.defaultCountryCode;
    const records = rows.map((raw, i) => normalizeRecord(raw, i, cc));
    const issues = [...records.flatMap(validateRecord), ...findDuplicates(records)];

    const payload = {
        records,
        issues,
        meta: {
            ...meta,
            sheetName,
            rowCount: records.length,
            lastModified: response.headers.get('last-modified') || null,
            loadedAt: new Date().toISOString(),
            sourceUrl: APP_CONFIG.dataSource.url,
            unmappedColumns: meta.totalColumns - meta.recognized,
        },
    };
    writeCache(payload);
    return { ...payload, fromCache: false };
}

export { DataError };
