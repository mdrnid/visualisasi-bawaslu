/**
 * Kontrak data: definisi kolom, pengenalan header, normalisasi nilai, dan aturan validasi.
 * Semua perubahan struktur data cukup dilakukan di berkas ini.
 */
import { slugify } from './text-utils.js';

// ============ KOLOM EXCEL (Sumber Kebenaran Tunggal) ============

/**
 * Urutan kolom Excel yang akan ditulis oleh server.
 * Ini adalah satu-satunya definisi urutan kolom - server.js akan mengimpornya.
 */
export const EXCEL_COLUMNS = Object.freeze([
    'ID',
    'NO',
    'PROVINSI',
    'KABUPATEN/KOTA',
    'NO URUT',
    'NAMA',
    'JENIS KELAMIN',
    'JABATAN',
    'WAKORDIV',
    'DIVISI',
    'AMJ',
    'AGAMA',
    'PENDIDIKAN',
    'HP',
    'EMAIL PRIBADI',
    'EMAIL KANTOR',
    'ALAMAT',
    'FACEBOOK',
    'INSTAGRAM',
    'WEBSITE',
    'FOTO',
]);

/**
 * Mapping dari key internal (di JavaScript) ke nama kolom Excel.
 * Server dan klien sama-sama pakai mapping ini.
 */
export const KEY_TO_EXCEL_COLUMN = Object.freeze({
    id: 'ID',
    no: 'NO',
    provinsi: 'PROVINSI',
    kabkota: 'KABUPATEN/KOTA',
    noUrut: 'NO URUT',
    nama: 'NAMA',
    gender: 'JENIS KELAMIN',
    jabatan: 'JABATAN',
    wakordiv: 'WAKORDIV',
    div: 'DIVISI',
    amj: 'AMJ',
    agama: 'AGAMA',
    pendidikan: 'PENDIDIKAN',
    hp: 'HP',
    emailP: 'EMAIL PRIBADI',
    emailK: 'EMAIL KANTOR',
    alamat: 'ALAMAT',
    facebook: 'FACEBOOK',
    instagram: 'INSTAGRAM',
    website: 'WEBSITE',
    foto: 'FOTO',
});

// ============ DEFINISI FIELD (UI & Validasi) ============

export const FIELDS = Object.freeze([
    { key: 'id', label: 'ID', group: 'identitas', type: 'id', required: true },
    { key: 'no', label: 'No', group: 'identitas', type: 'number' },
    { key: 'provinsi', label: 'Provinsi', group: 'identitas', type: 'category', required: true, facet: true },
    { key: 'kabkota', label: 'Kab/Kota', group: 'identitas', type: 'category', facet: true, searchable: true },
    { key: 'noUrut', label: 'No Urut', group: 'identitas', type: 'number' },
    { key: 'nama', label: 'Nama', group: 'identitas', type: 'text', required: true, searchable: true },
    { key: 'gender', label: 'Jenis Kelamin', group: 'identitas', type: 'category', facet: true },
    { key: 'jabatan', label: 'Jabatan', group: 'jabatan', type: 'category', facet: true, searchable: true },
    { key: 'wakordiv', label: 'Wakil Koordinator Divisi', group: 'jabatan', type: 'text' },
    { key: 'div', label: 'Divisi', group: 'jabatan', type: 'text' },
    { key: 'amj', label: 'Akhir Masa Jabatan', group: 'jabatan', type: 'category', facet: true },
    { key: 'agama', label: 'Agama', group: 'profil', type: 'category', facet: true },
    { key: 'pendidikan', label: 'Jenjang Pendidikan', group: 'profil', type: 'category', facet: true },
    { key: 'foto', label: 'Foto', group: 'profil', type: 'photo', hidden: true },
    { key: 'hp', label: 'Nomor HP/WhatsApp', group: 'kontak', type: 'phone', searchable: true },
    { key: 'emailP', label: 'E-mail Pribadi', group: 'kontak', type: 'email', searchable: true },
    { key: 'emailK', label: 'E-mail Kantor', group: 'kontak', type: 'email', searchable: true },
    { key: 'alamat', label: 'Alamat Kantor', group: 'lokasi', type: 'text', searchable: true },
    { key: 'facebook', label: 'Facebook', group: 'medsos', type: 'handle' },
    { key: 'instagram', label: 'Instagram', group: 'medsos', type: 'handle' },
    { key: 'website', label: 'Website', group: 'medsos', type: 'url' },
]);

export const FIELD_BY_KEY = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f.key, f])));

/** Kolom yang benar-benar ditampilkan di tabel & drawer (foto dipakai sebagai avatar). */
export const VISIBLE_FIELDS = Object.freeze(FIELDS.filter((f) => !f.hidden));

/** Atribut yang dihitung dalam skor kelengkapan profil. */
export const COMPLETENESS_KEYS = Object.freeze([
    'hp',
    'emailP',
    'emailK',
    'alamat',
    'facebook',
    'instagram',
    'website',
]);

/* ---------- Pengenalan header ---------- */

const slug = (v) =>
    String(v ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

/** Urutan penting: pola paling spesifik didahulukan. */
const HEADER_RULES = [
    ['id', (n) => n === 'ID' || n === 'IDPERSONEL' || n === 'PERSONELID'],
    ['foto', (n) => n === 'FOTO' || n === 'PHOTO' || n.includes('PASFOTO') || n.includes('FOTOPROFIL') || n.includes('URLFOTO')],
    ['provinsi', (n) => n.includes('PROVINSI') || n === 'PROV'],
    ['kabkota', (n) => n.includes('KABKOTA') || n.includes('KABUPATEN') || n.includes('KOTA')],
    ['gender', (n) => n.includes('JENISKELAMIN') || n === 'GENDER' || n === 'JK' || n === 'LP'],
    ['pendidikan', (n) => n.includes('PENDIDIKAN')],
    ['hp', (n) => n.includes('WHATSAPP') || n.includes('NOMORHP') || n.includes('NOHP') || n === 'HP' || n === 'WA'],
    ['emailP', (n) => /MAIL/.test(n) && n.includes('PRIBADI')],
    ['emailK', (n) => /MAIL/.test(n) && (n.includes('KANTOR') || n.includes('DINAS'))],
    ['facebook', (n) => n.includes('FACEBOOK') || n === 'FB'],
    ['instagram', (n) => n.includes('INSTAGRAM') || n === 'IG'],
    ['website', (n) => n.includes('WEBSITE') || n.includes('SITUS') || n === 'WEB'],
    ['alamat', (n) => n.includes('ALAMAT')],
    ['jabatan', (n) => n.startsWith('JABATAN')],
    ['wakordiv', (n) => n.startsWith('WAKOR')],
    ['div', (n) => n === 'DIV' || n.startsWith('DIVISI')],
    ['amj', (n) => n === 'AMJ' || n.startsWith('AKHIR MASA')],
    ['agama', (n) => n.startsWith('AGAMA')],
    ['nama', (n) => n.startsWith('NAMA')],
    ['__ORDINAL__', (n) => n === 'NO' || n === 'NOMOR' || n === 'NOURUT'],
];

/** @returns {string|null} kunci kanonik untuk sebuah teks header. */
export function mapHeader(raw) {
    const n = slug(raw);
    if (!n) return null;
    for (const [key, test] of HEADER_RULES) if (test(n)) return key;
    return null;
}

/** Skor seberapa besar kemungkinan sebuah baris adalah baris header. */
export function headerScore(row) {
    return row.reduce((acc, cell) => (mapHeader(cell) ? acc + 1 : acc), 0);
}

/* ---------- Normalisasi nilai ---------- */

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s./-])([a-z\u00e0-\u00ff])/g, (m, p, c) => p + c.toUpperCase());

export const isBlank = (v) => {
    const s = String(v ?? '')
        .trim()
        .toLowerCase();
    return s === '' || s === '-' || s === '--' || s === 'n/a' || s === 'na' || s === 'tidak ada' || s === 'null';
};

export function normGender(v) {
    const n = slug(v);
    if (!n) return '';
    const MALE = ['LAKILAKI', 'PRIA', 'MALE'];
    const FEMALE = ['PEREMPUAN', 'WANITA', 'FEMALE'];
    if (MALE.includes(n) || n === 'L' || n === 'M' || n === 'LK') return 'Laki-laki';
    if (FEMALE.includes(n) || n === 'P' || n === 'W' || n === 'F' || n === 'PR') return 'Perempuan';
    return titleCase(String(v).trim());
}

export function normPendidikan(v) {
    const n = slug(v);
    if (!n) return '';
    if (n.includes('S3') || n.includes('DOKTOR')) return 'S3';
    if (n.includes('S2') || n.includes('MAGISTER')) return 'S2';
    if (n.includes('S1') || n.includes('SARJANA')) return 'S1';
    if (n.startsWith('D')) return 'Diploma';
    if (n.includes('SMA') || n.includes('SLTA') || n.includes('SMK')) return 'SLTA';
    return String(v).trim().toUpperCase();
}

export function normAgama(v) {
    const n = slug(v);
    const map = {
        ISLAM: 'Islam',
        MUSLIM: 'Islam',
        KRISTEN: 'Kristen',
        PROTESTAN: 'Kristen',
        KATOLIK: 'Katolik',
        KHATOLIK: 'Katolik',
        HINDU: 'Hindu',
        BUDDHA: 'Buddha',
        BUDHA: 'Buddha',
        KONGHUCU: 'Konghucu',
        KHONGHUCU: 'Konghucu',
    };
    return map[n] || (v ? titleCase(String(v).trim()) : '');
}

/**
 * Normalisasi nomor Indonesia ke format 62xxxxxxxxxx.
 * Perbaikan dari versi lama:
 *  - "0811-1111 / 0822-2222" tidak lagi digabung jadi satu nomor raksasa.
 *  - Awalan internasional 0062 / +62 ditangani eksplisit.
 *  - Angka nol beruntun ("0081...") ikut dibersihkan.
 */
export function normPhone(v, cc = '62') {
    const first = String(v ?? '').split(/[\/;,]|\bdan\b|\batau\b/i)[0];
    let d = first.replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00' + cc)) d = d.slice(2);
    if (d.startsWith('0')) return cc + d.replace(/^0+/, '');
    if (d.startsWith(cc) && d.length >= 10) return d;
    if (d.length >= 8 && d.length <= 13) return cc + d;
    return d;
}

export function normHandle(v) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const m = s.match(/(?:facebook|instagram)\.com\/([^/?#\s]+)/i);
    return (m ? m[1] : s).replace(/^@/, '');
}

export function normUrl(v) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
}

/** Ubah satu baris mentah menjadi record bersih yang siap dianalisis. */
export function normalizeRecord(raw, index, cc = '62') {
    const rec = { _rowNumber: raw.__row ?? index + 2 };
    for (const f of FIELDS) {
        const v = raw[f.key];
        if (isBlank(v)) {
            rec[f.key] = '';
            continue;
        }
        const s = String(v).trim().replace(/\s+/g, ' ');
        switch (f.key) {
            case 'foto':
                // jangan di-titleCase; ini path/URL. Blokir skema berbahaya.
                rec[f.key] = /^\s*(javascript|vbscript):/i.test(s) ? '' : s.replace(/^\.?\//, '');
                break;
            case 'gender':
                rec[f.key] = normGender(s);
                break;
            case 'pendidikan':
                rec[f.key] = normPendidikan(s);
                break;
            case 'agama':
                rec[f.key] = normAgama(s);
                break;
            case 'provinsi':
            case 'kabkota':
            case 'nama':
                rec[f.key] = titleCase(s);
                break;
            case 'hp':
                rec[f.key] = normPhone(s, cc);
                break;
            case 'emailP':
            case 'emailK':
                rec[f.key] = s.toLowerCase();
                break;
            case 'facebook':
            case 'instagram':
                rec[f.key] = normHandle(s);
                break;
            case 'website':
                rec[f.key] = normUrl(s);
                break;
            default:
                rec[f.key] = s;
        }
    }
    
    // AUTO-RESOLVE FOTO: Jika kolom foto kosong, generate path berdasarkan nama
    if (!rec.foto && rec.nama) {
        const slugNama = slug(rec.nama);
        if (slugNama) {
            rec.foto = 'assets/personel/' + slugNama + '.webp';
        }
    }
    
    // Perbaikan: jika kabkota sama dengan provinsi, ubah menjadi format "Provinsi [Nama]"
    // untuk membedakan data Bawaslu Provinsi dengan Kabupaten/Kota
    if (rec.provinsi && rec.kabkota && 
        slug(rec.provinsi) === slug(rec.kabkota)) {
        rec.kabkota = 'Provinsi ' + rec.provinsi;
    }
    const filled = COMPLETENESS_KEYS.filter((k) => rec[k]).length;
    rec._completeness = Math.round((filled / COMPLETENESS_KEYS.length) * 100);
    rec._search = FIELDS.filter((f) => f.searchable)
        .map((f) => rec[f.key])
        .join(' ')
        .toLowerCase();
    
    // Kunci identitas stabil (tidak bergantung pada urutan array), dipakai
    // untuk deep link ?personPage=..., drawer, dan mode hapus.
    rec._key =
        [slugify(rec.kabkota), slugify(rec.nama)].filter(Boolean).join('--') || 'baris-' + rec._rowNumber;
    rec._id = rec._key; // difinalkan oleh assignStableIds()

    return rec;
}

/**
 * Memberi _id unik & stabil. Dipanggil sekali setelah seluruh record dinormalisasi,
 * karena deteksi tabrakan butuh melihat semua baris.
 */
/**
 * Assign ID stabil ke setiap record.
 * - Bila record sudah punya field `id` (dari Excel), gunakan itu.
 * - Bila belum, generate ID format PRS-XXXX berdasarkan urutan.
 * - Untuk backward compatibility, juga assign `_id` untuk kode lama yang masih pakai itu.
 */
export function assignStableIds(records) {
    const seen = new Map();
    const idSeen = new Set();
    let autoCounter = 1;
    
    for (const rec of records) {
        // 1. Cek apakah record sudah punya ID dari Excel
        if (rec.id && typeof rec.id === 'string' && rec.id.trim()) {
            const cleanId = rec.id.trim().toUpperCase();
            // Validasi format ID (PRS-XXXX atau apapun yang dimulai PRS)
            if (/^PRS-\d{4,}$/.test(cleanId)) {
                if (idSeen.has(cleanId)) {
                    // ID duplikat - generate baru
                    console.warn(`[schema] ID duplikat: ${cleanId}, generate baru`);
                } else {
                    rec.id = cleanId;
                    rec._id = cleanId; // backward compatibility
                    idSeen.add(cleanId);
                    continue;
                }
            }
        }
        
        // 2. Generate ID baru (PRS-XXXX zero-padded 4 digit)
        let newId;
        do {
            newId = `PRS-${String(autoCounter).padStart(4, '0')}`;
            autoCounter++;
        } while (idSeen.has(newId));
        
        rec.id = newId;
        rec._id = newId; // backward compatibility
        idSeen.add(newId);
        
        // 3. Untuk backward compatibility, assign _key juga
        const base = rec._key || 'baris-' + rec._rowNumber;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        rec._legacyId = n === 1 ? base : base + '-' + n;
    }
    return records;
}

/* ---------- Validasi ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** @returns {Array<{rowNumber:number, nama:string, severity:'error'|'warning', field:string, message:string}>} */
export function validateRecord(rec) {
    const issues = [];
    const push = (severity, field, message) =>
        issues.push({ rowNumber: rec._rowNumber, nama: rec.nama || '(tanpa nama)', severity, field, message });

    for (const f of FIELDS) {
        if (f.required && !rec[f.key]) push('error', f.label, 'Wajib diisi tetapi kosong');
    }
    for (const k of ['emailP', 'emailK']) {
        if (rec[k] && !EMAIL_RE.test(rec[k]))
            push('error', FIELD_BY_KEY[k].label, 'Format e-mail tidak valid: ' + rec[k]);
    }
    if (rec.hp && !/^62\d{8,13}$/.test(rec.hp)) {
        push('warning', 'Nomor HP/WhatsApp', 'Format nomor tidak wajar: ' + rec.hp);
    }
    if (!rec.hp && !rec.emailK && !rec.emailP) {
        push('warning', 'Kontak', 'Tidak ada satu pun kanal kontak');
    }
    return issues;
}

/** Deteksi duplikat lintas baris (nomor HP dan e-mail kantor). */
export function findDuplicates(records) {
    const issues = [];
    const seen = new Map();
    for (const key of ['hp', 'emailK']) {
        seen.clear();
        for (const r of records) {
            const v = r[key];
            if (!v) continue;
            if (seen.has(v)) {
                issues.push({
                    rowNumber: r._rowNumber,
                    nama: r.nama || '(tanpa nama)',
                    severity: 'warning',
                    field: FIELD_BY_KEY[key].label,
                    message: 'Duplikat dengan baris ' + seen.get(v) + ': ' + v,
                });
            } else {
                seen.set(v, r._rowNumber);
            }
        }
    }
    return issues;
}
