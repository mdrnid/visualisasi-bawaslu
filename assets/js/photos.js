/**
 * Resolusi & rendering foto profil personel.
 *
 * Strategi:
 *  1. Kolom FOTO pada Excel = sumber kebenaran pertama.
 *  2. Bila kosong, coba beberapa kandidat nama berkas (slug lengkap,
 *     slug tanpa gelar, varian subfolder kab/kota) x beberapa ekstensi.
 *  3. Bila manifes assets/personel/index.json tersedia, resolusi O(1)
 *     tanpa satu pun request 404.
 *  4. Tanpa manifes, kandidat diuji dengan objek Image (bukan fetch) supaya
 *     patuh CSP img-src 'self' dan tidak butuh CORS. Jumlah percobaan dibatasi.
 *  5. Hasil positif maupun negatif di-cache di memori.
 *  6. Markup selalu merender inisial lebih dulu; <img> disisipkan hanya jika
 *     terbukti dapat dimuat -> tidak pernah ada ikon gambar rusak, tidak ada
 *     layout shift, dan tidak ada atribut event inline (aman CSP).
 */
import { esc, initials, slugify, stripNameTitles } from './text-utils.js';

export const PHOTO_CONFIG = Object.freeze({
    baseDir: 'assets/personel/',
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    manifestUrl: 'assets/personel/index.json',
    maxProbes: 8,
    probeTimeoutMs: 8000,
});

const resolveCache = new Map(); // cacheKey -> string | null
const resolvePending = new Map(); // cacheKey -> Promise
const probeCache = new Map(); // url -> Promise<boolean>
let manifestPromise = null;

const isAbsoluteUrl = (v) => /^(https?:)?\/\//i.test(v) || v.startsWith('data:');
const hasExtension = (v) => /\.(jpe?g|png|webp|avif|gif)$/i.test(v);
const normalizeRelative = (v) => v.replace(/^\.?\/+/, '');

export function photoCacheKey(record) {
    return [record?.foto ?? '', record?.nama ?? '', record?.kabkota ?? ''].join('|').toLowerCase();
}

/** Fungsi murni: daftar kandidat URL, terurut dari yang paling dipercaya. */
export function photoCandidates(record, options = {}) {
    const cfg = { ...PHOTO_CONFIG, ...options };
    const out = [];
    const push = (url) => {
        if (url && !out.includes(url)) out.push(url);
    };
    const withExtensions = (pathNoExt) => cfg.extensions.forEach((ext) => push(pathNoExt + '.' + ext));

    const explicit = String(record?.foto ?? '').trim();
    if (explicit) {
        if (isAbsoluteUrl(explicit)) {
            push(explicit);
        } else if (hasExtension(explicit)) {
            const rel = normalizeRelative(explicit);
            push(rel.includes('/') ? rel : cfg.baseDir + rel);
        } else {
            withExtensions(cfg.baseDir + slugify(explicit));
        }
    }

    const folder = slugify(record?.kabkota);
    const fullSlug = slugify(record?.nama);
    const bareSlug = slugify(stripNameTitles(record?.nama));

    for (const slug of [fullSlug, bareSlug]) {
        if (!slug) continue;
        withExtensions(cfg.baseDir + slug);
        if (folder) withExtensions(cfg.baseDir + folder + '/' + slug);
    }
    return out;
}

/** Manifes opsional: array nama berkas relatif terhadap baseDir. */
export function loadPhotoManifest(options = {}) {
    const cfg = { ...PHOTO_CONFIG, ...options };
    if (manifestPromise) return manifestPromise;
    if (typeof fetch !== 'function' || !cfg.manifestUrl) {
        manifestPromise = Promise.resolve(null);
        return manifestPromise;
    }
    manifestPromise = fetch(cfg.manifestUrl, { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => (Array.isArray(data) ? new Set(data.map((f) => normalizeRelative(String(f)))) : null))
        .catch(() => null);
    return manifestPromise;
}

function probeImage(url, timeoutMs) {
    if (probeCache.has(url)) return probeCache.get(url);
    const task = new Promise((resolve) => {
        if (typeof Image === 'undefined') {
            resolve(false);
            return;
        }
        const img = new Image();
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
        img.onerror = () => finish(false);
        img.decoding = 'async';
        img.src = url;
    });
    probeCache.set(url, task);
    return task;
}

/** @returns {Promise<string|null>} URL foto yang terbukti ada, atau null. */
export async function resolvePhotoUrl(record, options = {}) {
    const cfg = { ...PHOTO_CONFIG, ...options };
    const key = photoCacheKey(record);
    if (resolveCache.has(key)) return resolveCache.get(key);
    if (resolvePending.has(key)) return resolvePending.get(key);

    const task = (async () => {
        const candidates = photoCandidates(record, cfg);
        if (!candidates.length) return null;

        const manifest = cfg.manifest !== undefined ? cfg.manifest : await loadPhotoManifest(cfg);
        if (manifest) {
            const hit = candidates.find(
                (url) =>
                    isAbsoluteUrl(url) ||
                    manifest.has(url.startsWith(cfg.baseDir) ? url.slice(cfg.baseDir.length) : url)
            );
            return hit ?? null;
        }

        const probe = cfg.probe || ((url) => probeImage(url, cfg.probeTimeoutMs));
        let budget = Math.max(1, cfg.maxProbes);
        for (const url of candidates) {
            if (budget <= 0) break;
            budget -= 1;
            if (await probe(url)) return url;
        }
        return null;
    })();

    resolvePending.set(key, task);
    const result = await task.catch(() => null);
    resolvePending.delete(key);
    resolveCache.set(key, result);
    return result;
}

/**
 * Markup avatar. Selalu merender inisial lebih dulu.
 * size: 'sm' | 'md' | 'lg' | 'xl'
 */
export function avatarMarkup(record, { size = 'md', className = '' } = {}) {
    const name = record?.nama || '';
    const classes = ['avatar', 'avatar--' + size, className].filter(Boolean).join(' ');
    return (
        '<span class="' + esc(classes) + '" data-avatar-pending="1"' +
        ' data-avatar-name="' + esc(name) + '"' +
        ' data-avatar-foto="' + esc(record?.foto || '') + '"' +
        ' data-avatar-kabkota="' + esc(record?.kabkota || '') + '"' +
        ' role="img" aria-label="Foto ' + esc(name || 'personel') + '">' +
        '<span class="avatar__initials" aria-hidden="true">' + esc(initials(name)) + '</span>' +
        '</span>'
    );
}

function applyPhoto(el, url) {
    if (el.querySelector('.avatar__img')) return;
    const img = new Image();
    img.className = 'avatar__img';
    img.alt = ''; // teks alternatif sudah ada pada aria-label pembungkus
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = url;
    el.appendChild(img);
    el.classList.add('has-photo');
}

/**
 * Panggil setelah setiap render yang memakai avatarMarkup(). Idempoten.
 * 
 * OPTIMASI: Avatar di-hydrate dalam batch kecil untuk menghindari blocking UI thread.
 * Menggunakan IntersectionObserver + batching untuk performa optimal.
 */
export function hydrateAvatars(root = document, options = {}) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const nodes = Array.from(root.querySelectorAll('[data-avatar-pending="1"]'));
    if (!nodes.length) return;

    const BATCH_SIZE = options.batchSize || 8; // Proses 8 avatar per batch
    const BATCH_DELAY = options.batchDelay || 30; // Delay 30ms antar batch

    const start = (el) => {
        el.dataset.avatarPending = '0';
        const record = {
            nama: el.dataset.avatarName || '',
            foto: el.dataset.avatarFoto || '',
            kabkota: el.dataset.avatarKabkota || '',
        };
        resolvePhotoUrl(record, options).then((url) => {
            if (url && el.isConnected) applyPhoto(el, url);
        });
    };

    // Fallback untuk browser tanpa IntersectionObserver: proses dalam batch
    if (typeof IntersectionObserver === 'undefined') {
        console.log('[photos] ⚠️  IntersectionObserver not supported, using batched fallback');
        processBatched(nodes, start, BATCH_SIZE, BATCH_DELAY);
        return;
    }

    // Priority queue: avatar yang visible di viewport diproses lebih dulu
    const visibleQueue = [];
    const hiddenQueue = [];

    const observer = new IntersectionObserver(
        (entries, obs) => {
            for (const entry of entries) {
                obs.unobserve(entry.target);
                
                if (entry.isIntersecting) {
                    visibleQueue.push(entry.target);
                } else {
                    hiddenQueue.push(entry.target);
                }
            }
            
            // Process visible avatars dengan priority tinggi
            if (visibleQueue.length > 0) {
                const batch = visibleQueue.splice(0, BATCH_SIZE);
                batch.forEach(start);
            }
        },
        { rootMargin: '300px 0px' } // Load sedikit lebih awal untuk smooth scrolling
    );

    // Observe semua avatar
    nodes.forEach((node) => observer.observe(node));

    // Process hidden avatars secara bertahap dengan delay lebih besar
    if (hiddenQueue.length > 0) {
        setTimeout(() => {
            processBatched(hiddenQueue, start, BATCH_SIZE, BATCH_DELAY * 2);
        }, 500); // Delay initial untuk prioritas ke visible avatars
    }
}

/**
 * Helper function untuk memproses elemen dalam batch dengan delay.
 * Mencegah blocking UI thread saat processing banyak avatar sekaligus.
 */
function processBatched(elements, processor, batchSize, delay) {
    let index = 0;
    
    const processBatch = () => {
        const batch = elements.slice(index, index + batchSize);
        
        if (batch.length === 0) return;
        
        // Process batch
        batch.forEach(processor);
        
        index += batchSize;
        
        // Schedule next batch
        if (index < elements.length) {
            const scheduleNext = typeof requestIdleCallback === 'function'
                ? (fn) => requestIdleCallback(fn, { timeout: delay + 50 })
                : (fn) => setTimeout(fn, delay);
            
            scheduleNext(processBatch);
        }
    };
    
    processBatch();
}

/** Dipanggil dari tombol "Muat Ulang Data". */
export function clearPhotoCache() {
    resolveCache.clear();
    resolvePending.clear();
    probeCache.clear();
    manifestPromise = null;
}
