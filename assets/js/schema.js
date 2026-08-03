/**
 * Kontrak data: definisi kolom, pengenalan header, normalisasi nilai, dan aturan validasi.
 * Semua perubahan struktur data cukup dilakukan di berkas ini.
 */

export const FIELDS = Object.freeze([
    { key: 'no', label: 'No', group: 'identitas', type: 'number' },
    { key: 'provinsi', label: 'Provinsi', group: 'identitas', type: 'category', required: true, facet: true },
    { key: 'noUrut', label: 'No Urut', group: 'identitas', type: 'number' },
    { key: 'nama', label: 'Nama', group: 'identitas', type: 'text', required: true, searchable: true },
    { key: 'gender', label: 'Jenis Kelamin', group: 'identitas', type: 'category', facet: true },
    { key: 'jabatan', label: 'Jabatan', group: 'jabatan', type: 'category', facet: true, searchable: true },
    { key: 'wakor', label: 'Wakor', group: 'jabatan', type: 'text' },
    { key: 'div', label: 'Div', group: 'jabatan', type: 'text' },
    { key: 'am', label: 'AM', group: 'jabatan', type: 'text' },
    { key: 'jaga', label: 'Jaga', group: 'jabatan', type: 'text' },
    { key: 'agama', label: 'Agama', group: 'profil', type: 'category', facet: true },
    { key: 'pendidikan', label: 'Jenjang Pendidikan', group: 'profil', type: 'category', facet: true },
    { key: 'hp', label: 'Nomor HP/WhatsApp', group: 'kontak', type: 'phone', searchable: true },
    { key: 'emailP', label: 'E-mail Pribadi', group: 'kontak', type: 'email', searchable: true },
    { key: 'emailK', label: 'E-mail Kantor', group: 'kontak', type: 'email', searchable: true },
    { key: 'alamat', label: 'Alamat Kantor', group: 'lokasi', type: 'text', searchable: true },
    { key: 'facebook', label: 'Facebook', group: 'medsos', type: 'handle' },
    { key: 'instagram', label: 'Instagram', group: 'medsos', type: 'handle' },
    { key: 'website', label: 'Website', group: 'medsos', type: 'url' },
]);

export const FIELD_BY_KEY = Object.freeze(
    Object.fromEntries(FIELDS.map((f) => [f.key, f]))
);

/** Atribut yang dihitung dalam skor kelengkapan profil. */
export const COMPLETENESS_KEYS = Object.freeze([
    'hp', 'emailP', 'emailK', 'alamat', 'facebook', 'instagram', 'website',
]);

/* ---------- Pengenalan header ---------- */

const slug = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Urutan penting: pola paling spesifik didahulukan. */
const HEADER_RULES = [
    ['provinsi', (n) => n.includes('PROVINSI') || n === 'PROV'],
    ['gender', (n) => n.includes('JENISKELAMIN') || n === 'GENDER' || n === 'JK' || n === 'LP'],
    ['pendidikan', (n) => n.includes('PENDIDIKAN')],
    ['hp', (n) => n.includes('WHATSAPP') || n.includes('NOMORHP') || n.includes('NOHP') || n === 'HP' || n === 'WA'],
    ['emailP', (n) => /MAIL/.test(n) && n.includes('PRIBADI')],
    ['emailK', (n) => /MAIL/.test(n) && (n.includes('KANTOR') || n.includes('DINAS'))],
    ['alamat', (n) => n.includes('ALAMAT')],
    ['facebook', (n) => n.includes('FACEBOOK') || n === 'FB'],
    ['instagram', (n) => n.includes('INSTAGRAM') || n === 'IG'],
    ['website', (n) => n.includes('WEBSITE') || n.includes('SITUS') || n === 'WEB'],
    ['jabatan', (n) => n.startsWith('JABATAN')],
    ['wakor', (n) => n.startsWith('WAKOR')],
    ['div', (n) => n === 'DIV' || n.startsWith('DIVISI')],
    ['am', (n) => n === 'AM'],
    ['jaga', (n) => n.startsWith('JAGA')],
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

const titleCase = (s) =>
    s.toLowerCase().replace(/(^|[\s./-])([a-z\u00e0-\u00ff])/g, (m, p, c) => p + c.toUpperCase());

export const isBlank = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === '' || s === '-' || s === '--' || s === 'n/a' || s === 'na' || s === 'tidak ada' || s === 'null';
};

function normGender(v) {
    const n = slug(v);
    if (!n) return '';
    if (n.startsWith('L') || n.startsWith('PRIA') || n === 'M' || n === 'MALE') return 'Laki-laki';
    if (n.startsWith('P') || n.startsWith('W') || n === 'F' || n === 'FEMALE') return 'Perempuan';
    return titleCase(String(v).trim());
}

function normPendidikan(v) {
    const n = slug(v);
    if (!n) return '';
    if (n.includes('S3') || n.includes('DOKTOR')) return 'S3';
    if (n.includes('S2') || n.includes('MAGISTER')) return 'S2';
    if (n.includes('S1') || n.includes('SARJANA')) return 'S1';
    if (n.startsWith('D')) return 'Diploma';
    if (n.includes('SMA') || n.includes('SLTA') || n.includes('SMK')) return 'SLTA';
    return String(v).trim().toUpperCase();
}

function normAgama(v) {
    const n = slug(v);
    const map = {
        ISLAM: 'Islam', MUSLIM: 'Islam', KRISTEN: 'Kristen', PROTESTAN: 'Kristen',
        KATOLIK: 'Katolik', KHATOLIK: 'Katolik', HINDU: 'Hindu', BUDDHA: 'Buddha', BUDHA: 'Buddha',
        KONGHUCU: 'Konghucu', KHONGHUCU: 'Konghucu'
    };
    return map[n] || (v ? titleCase(String(v).trim()) : '');
}

/** 08xx / +62xx / (0411) xxx → 62xxxxxxxxxx */
export function normPhone(v, cc = '62') {
    const d = String(v ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) return cc + d.slice(1);
    if (d.startsWith(cc)) return d;
    if (d.length >= 9 && d.length <= 13) return cc + d;
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
    const rec = { _id: 'row-' + (index + 1), _rowNumber: raw.__row ?? index + 2 };
    for (const f of FIELDS) {
        const v = raw[f.key];
        if (isBlank(v)) { rec[f.key] = ''; continue; }
        const s = String(v).trim().replace(/\s+/g, ' ');
        switch (f.key) {
            case 'gender': rec[f.key] = normGender(s); break;
            case 'pendidikan': rec[f.key] = normPendidikan(s); break;
            case 'agama': rec[f.key] = normAgama(s); break;
            case 'provinsi':
            case 'nama': rec[f.key] = titleCase(s); break;
            case 'hp': rec[f.key] = normPhone(s, cc); break;
            case 'emailP':
            case 'emailK': rec[f.key] = s.toLowerCase(); break;
            case 'facebook':
            case 'instagram': rec[f.key] = normHandle(s); break;
            case 'website': rec[f.key] = normUrl(s); break;
            default: rec[f.key] = s;
        }
    }
    const filled = COMPLETENESS_KEYS.filter((k) => rec[k]).length;
    rec._completeness = Math.round((filled / COMPLETENESS_KEYS.length) * 100);
    rec._search = FIELDS.filter((f) => f.searchable)
        .map((f) => rec[f.key]).join(' ').toLowerCase();
    return rec;
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
        if (rec[k] && !EMAIL_RE.test(rec[k])) push('error', FIELD_BY_KEY[k].label, 'Format e-mail tidak valid: ' + rec[k]);
    }
    if (rec.hp && (rec.hp.length < 10 || rec.hp.length > 15)) {
        push('warning', 'Nomor HP/WhatsApp', 'Panjang nomor tidak wajar: ' + rec.hp);
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
                    rowNumber: r._rowNumber, nama: r.nama || '(tanpa nama)', severity: 'warning',
                    field: FIELD_BY_KEY[key].label,
                    message: 'Duplikat dengan baris ' + seen.get(v) + ': ' + v,
                });
            } else seen.set(v, r._rowNumber);
        }
    }
    return issues;
}