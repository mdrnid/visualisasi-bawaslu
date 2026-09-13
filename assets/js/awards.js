/**
 * Lapisan data "Penghargaan & Prestasi" personel (relasi 1 personel : N penghargaan).
 *
 * Sumber: data/penghargaan.json. Sengaja dipisah dari data/data.xlsx agar satu
 * personel tetap satu baris di berkas utama (tidak ada duplikasi identitas).
 *
 * Pencocokan ke record personel memakai kunci longgar:
 *   - kab/kota tanpa awalan "Kabupaten"/"Kota"  -> regionKey()
 *   - nama tanpa gelar depan & belakang          -> nameKey()
 *   - toleransi satu salah ketik pada nama       -> isNearMatch()
 * sehingga "Bustanil Nassa, S.Hi., MH", "BUSTANIL NASSA", dan salah ketik
 * "Bustani Nassa" tetap mengarah ke orang yang sama.
 *
 * Tidak ada operasi DOM di berkas ini sehingga mudah diuji unit.
 */
import { slugify, stripNameTitles } from './text-utils.js';

export const AWARDS_CONFIG = Object.freeze({
    url: 'data/penghargaan.json',
    label: 'Penghargaan & Prestasi',
    periode: '2023–2028',
    /** Panjang minimal kunci nama yang boleh dicocokkan longgar (hindari salah orang). */
    minFuzzyLength: 6,
    /** Direktori dasar berkas bukti lokal. */
    proofBaseDir: 'assets/awards/',
    /** URL manifes berkas bukti lokal. */
    proofManifestUrl: 'assets/awards/index.json',
});

/** Ekstensi berkas yang didukung sebagai bukti. */
const PDF_EXT = /\.(pdf)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Menentukan tipe bukti berdasarkan URL/path.
 * @returns {'pdf' | 'image' | 'drive' | 'link' | ''}
 */
export function proofType(url) {
    const s = String(url ?? '').trim();
    if (!s) return '';
    if (PDF_EXT.test(s)) return 'pdf';
    if (IMG_EXT.test(s)) return 'image';
    if (/drive\.google\.com/i.test(s)) return 'drive';
    if (/^https?:\/\//i.test(s)) return 'link';
    return '';
}

/** Label tombol yang ditampilkan sesuai tipe bukti. */
export function proofLabel(type) {
    switch (type) {
        case 'pdf': return 'Buka PDF';
        case 'image': return 'Lihat Foto';
        case 'drive': return 'Buka Drive ↗';
        case 'link': return 'Buka Link ↗';
        default: return 'Bukti belum tersedia';
    }
}

/** Badge singkat tipe berkas. */
export function proofBadge(type) {
    switch (type) {
        case 'pdf': return 'PDF';
        case 'image': return 'FOTO';
        case 'drive': return 'DRIVE';
        case 'link': return 'LINK';
        default: return '';
    }
}

/** Urutan tampil: prestasi dulu, lalu peran, lalu kegiatan. */
export const CATEGORY_ORDER = Object.freeze([
    'Prestasi',
    'Narasumber',
    'Fasilitator',
    'Pelatihan',
    'Akademik',
    'Diskusi',
    'Responden',
    'Lainnya',
]);

const CATEGORY_RULES = [
    ['Prestasi', /\b(terbaik|terbanyak|juara|peringkat|penghargaan|prestasi|award|apresiasi)\b/i],
    ['Narasumber', /narasumber/i],
    ['Fasilitator', /fasilitator|pemateri|pelatih\b/i],
    ['Pelatihan', /pelatihan|kursus|bimtek|bimbingan teknis/i],
    ['Akademik', /kuliah|lecture|bedah putusan|kajian|seminar/i],
    ['Diskusi', /diskusi|webinar|talkshow|dialog/i],
    ['Responden', /responden|survei|survey|asesmen/i],
];

/** Kategori otomatis dari judul penghargaan (dipakai untuk tag & pengurutan). */
export function awardCategory(text) {
    const s = String(text ?? '');
    for (const [name, pattern] of CATEGORY_RULES) if (pattern.test(s)) return name;
    return 'Lainnya';
}

/** "Kabupaten Jeneponto" -> "jeneponto"; "Kota Makassar" -> "makassar". */
export function regionKey(value) {
    return slugify(String(value ?? '').replace(/^\s*(kabupaten|kota administrasi|kota|kab\.?)\s+/i, ''));
}

/** "Dr. Bustanil Nassa, S.Hi., MH" -> "bustanil-nassa". */
export function nameKey(value) {
    return slugify(stripNameTitles(value));
}

/** Kunci utama pencocokan: wilayah + nama. */
export function personKey(kabkota, nama) {
    const person = nameKey(nama);
    if (!person) return '';
    return regionKey(kabkota) + '|' + person;
}

/** True bila dua kunci nama identik atau berbeda maksimal satu karakter. */
export function isNearMatch(a, b) {
    const x = String(a ?? '');
    const y = String(b ?? '');
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.abs(x.length - y.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < x.length && j < y.length) {
        if (x[i] === y[j]) {
            i += 1;
            j += 1;
            continue;
        }
        edits += 1;
        if (edits > 1) return false;
        if (x.length > y.length) i += 1;
        else if (x.length < y.length) j += 1;
        else {
            i += 1;
            j += 1;
        }
    }
    return edits + (x.length - i) + (y.length - j) <= 1;
}

/**
 * Satu sel Excel kadang memuat beberapa penghargaan bernomor:
 * "1. A 2. B 3. C" -> ["A", "B", "C"]. Teks biasa dikembalikan utuh.
 */
export function splitAwardText(text) {
    const s = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return [];
    if (!/\b\d{1,2}[.)]\s/.test(s)) return [s];
    const parts = s
        .split(/(?=\b\d{1,2}[.)]\s)/)
        .map((p) => p.replace(/^\s*\d{1,2}[.)]\s*/, '').replace(/\s*\.\s*$/, '').trim())
        .filter(Boolean);
    return parts.length > 1 ? parts : [s];
}

function dedupe(items) {
    const seen = new Set();
    return items.filter((a) => {
        const key = [a._personKey, a.penghargaan.toLowerCase(), a.bukti].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Memeriksa apakah sebuah URL/path bukti aman untuk ditampilkan.
 * Menerima: http/https URL, dan path lokal relatif ke assets/awards/.
 */
function safeBukti(rawBukti) {
    const s = String(rawBukti ?? '').trim();
    if (!s) return '';
    // URL absolut: hanya http/https
    if (/^https?:\/\//i.test(s)) return s;
    // Path lokal relatif: harus dimulai dengan assets/awards/ dan memiliki ekstensi yang diizinkan
    if (/^assets\/awards\//i.test(s) && (PDF_EXT.test(s) || IMG_EXT.test(s))) return s;
    // Blokir javascript:, data:, dan path tidak dikenal
    return '';
}

/** Normalisasi satu penghargaan mentah menjadi objek siap tampil. */
export function normalizeAward(raw, index = 0) {
    const personnel_id = String(raw?.personnel_id ?? raw?.personnelId ?? '').trim();
    const kabkota = String(raw?.kabkota ?? raw?.['Kab/Kota'] ?? '').trim();
    const nama = String(raw?.nama ?? raw?.Nama ?? '').trim();
    const penghargaan = String(raw?.penghargaan ?? '').trim();
    const rawBukti = String(raw?.bukti ?? raw?.link ?? '').trim();
    const bukti = safeBukti(rawBukti);
    return {
        _id: 'award-' + (index + 1),
        _personKey: personKey(kabkota, nama),
        _nameKey: nameKey(nama),
        personnel_id,
        kabkota,
        nama,
        jabatan: String(raw?.jabatan ?? '').trim(),
        kordiv: String(raw?.kordiv ?? '').trim(),
        wakordiv: String(raw?.wakordiv ?? '').trim(),
        penghargaan,
        kategori: raw?.kategori ? String(raw.kategori).trim() : awardCategory(penghargaan),
        bukti,
        _proofType: proofType(bukti),
        periode: String(raw?.periode ?? AWARDS_CONFIG.periode).trim(),
    };
}

/** Normalisasi seluruh daftar + pemecahan daftar bernomor + buang duplikat. */
export function normalizeAwards(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const raw of list) {
        for (const title of splitAwardText(raw?.penghargaan)) {
            const item = normalizeAward({ ...raw, penghargaan: title }, out.length);
            if (item.nama && item.penghargaan) out.push(item);
        }
    }
    return dedupe(out);
}

function rank(kategori) {
    const i = CATEGORY_ORDER.indexOf(kategori);
    return i < 0 ? CATEGORY_ORDER.length : i;
}

function compareAwards(a, b) {
    const diff = rank(a.kategori) - rank(b.kategori);
    return diff !== 0 ? diff : a.penghargaan.localeCompare(b.penghargaan, 'id');
}

/**
 * Menempelkan rec._awards dan rec._awardCount pada setiap record personel.
 * @returns {{matchedPeople:number, matchedAwards:number, unmatched:Array}}
 */
export function attachAwards(records = [], awards = []) {
    const byPersonnelId = new Map();
    const byPerson = new Map();
    const byName = new Map();
    const push = (map, key, value) => {
        if (!key) return;
        const list = map.get(key);
        if (list) list.push(value);
        else map.set(key, [value]);
    };
    for (const a of awards) {
        if (a.personnel_id) push(byPersonnelId, a.personnel_id, a);
        push(byPerson, a._personKey, a);
        push(byName, a._nameKey, a);
    }

    const used = new Set();
    let matchedPeople = 0;

    for (const rec of records) {
        const nk = nameKey(rec.nama);
        const region = regionKey(rec.kabkota);
        const found = new Map();
        const collect = (items) => {
            if (items) for (const a of items) found.set(a._id, a);
        };

        // Prioritas 1: Cocokkan via UUID id personnel (tidak terpengaruh pengubahan nama)
        if (rec.id && byPersonnelId.has(rec.id)) {
            collect(byPersonnelId.get(rec.id));
        }

        // Fallback untuk backward compatibility: cocokkan via nama dan wilayah
        collect(byPerson.get(region + '|' + nk));
        collect(byName.get(nk));

        // Toleransi satu salah ketik, hanya untuk nama yang cukup panjang
        // dan hanya di wilayah yang sama supaya tidak salah orang.
        if (nk.length >= AWARDS_CONFIG.minFuzzyLength) {
            for (const [key, items] of byPerson) {
                const sep = key.indexOf('|');
                const keyRegion = key.slice(0, sep);
                const keyName = key.slice(sep + 1);
                if (region && keyRegion && keyRegion !== region) continue;
                if (
                    isNearMatch(keyName, nk) ||
                    (region && keyRegion === region && (keyName.startsWith(nk + '-') || nk.startsWith(keyName + '-')))
                ) {
                    collect(items);
                }
            }
        }

        const sorted = [...found.values()].sort(compareAwards);
        rec._awards = sorted;
        rec._awardCount = sorted.length;
        if (sorted.length) {
            matchedPeople += 1;
            for (const a of sorted) used.add(a._id);
        }
    }

    return {
        matchedPeople,
        matchedAwards: used.size,
        unmatched: awards.filter((a) => !used.has(a._id)),
    };
}

let awardsPromise = null;

/** Memuat data penghargaan. Kegagalan TIDAK boleh menjatuhkan aplikasi. */
export async function loadAwards({ force = false, url = AWARDS_CONFIG.url } = {}) {
    if (force) awardsPromise = null;
    if (!awardsPromise) {
        awardsPromise = (async () => {
            if (typeof fetch !== 'function') return [];
            const target = url + (force ? '?t=' + Date.now() : '');
            const res = await fetch(target, { cache: force ? 'reload' : 'default' });
            if (!res.ok) throw new Error('Berkas penghargaan tidak terbaca (HTTP ' + res.status + ').');
            const json = await res.json();
            const normalized = normalizeAwards(Array.isArray(json) ? json : json?.data);
            try {
                const manifest = await loadProofManifest({ force });
                enrichWithLocalProofs(normalized, manifest);
            } catch (manifestErr) {
                console.warn('[awards] manifes bukti lokal dilewati:', manifestErr);
            }
            return normalized;
        })().catch((err) => {
            console.warn('[awards] data penghargaan dilewati:', err);
            awardsPromise = null;
            return [];
        });
    }
    return awardsPromise;
}

/** Dipanggil tombol "Muat Ulang Data". */
export function clearAwardsCache() {
    awardsPromise = null;
    proofManifestPromise = null;
}

let proofManifestPromise = null;

/**
 * Memuat manifes berkas bukti lokal (assets/awards/index.json).
 * Mengembalikan Set berisi path relatif berkas yang benar-benar ada.
 */
export async function loadProofManifest({ force = false } = {}) {
    if (force) proofManifestPromise = null;
    if (!proofManifestPromise) {
        proofManifestPromise = (async () => {
            if (typeof fetch !== 'function') return new Set();
            const url = AWARDS_CONFIG.proofManifestUrl + (force ? '?t=' + Date.now() : '');
            const res = await fetch(url, { cache: force ? 'reload' : 'default' });
            if (!res.ok) return new Set();
            const json = await res.json();
            return new Set(Array.isArray(json) ? json : []);
        })().catch(() => {
            proofManifestPromise = null;
            return new Set();
        });
    }
    return proofManifestPromise;
}

/**
 * Mencoba mencocokkan berkas bukti lokal dari manifes berdasarkan wilayah + nama.
 * Hanya mengisi bukti yang masih kosong atau masih berupa link Drive.
 */
export function enrichWithLocalProofs(awards, manifest) {
    if (!manifest || manifest.size === 0) return;
    for (const a of awards) {
        // Jika sudah ada bukti lokal, tidak perlu diubah
        if (a.bukti && !a.bukti.startsWith('http')) continue;

        const region = regionKey(a.kabkota);
        const name = a._nameKey;
        if (!region || !name) continue;

        // Cari berkas di manifes yang cocok dengan wilayah/nama
        const prefix = region + '/' + name + '/';
        const candidates = [...manifest].filter((f) => f.startsWith(prefix));
        if (candidates.length === 0) continue;

        // Gunakan berkas lokal pertama yang cocok
        // (urut berdasarkan nomor urut di nama berkas)
        candidates.sort();
        const idx = a._id ? parseInt(a._id.replace('award-', ''), 10) : 1;
        const match = candidates[idx - 1] || candidates[0];
        if (match) {
            a.bukti = AWARDS_CONFIG.proofBaseDir + match;
            a._proofType = proofType(a.bukti);
        }
    }
}

/** Ringkasan untuk kebutuhan analitik/grafik lanjutan. */
export function awardStats(records = []) {
    const perKabkota = new Map();
    const perKategori = new Map();
    let total = 0;
    for (const rec of records) {
        for (const a of rec._awards || []) {
            total += 1;
            const kab = rec.kabkota || a.kabkota || 'Tidak diketahui';
            perKabkota.set(kab, (perKabkota.get(kab) || 0) + 1);
            perKategori.set(a.kategori, (perKategori.get(a.kategori) || 0) + 1);
        }
    }
    return { total, perKabkota, perKategori };
}
