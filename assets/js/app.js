/** Komposisi aplikasi: state, filter, sinkronisasi URL, dan orkestrasi render. */
import { APP_CONFIG } from './config.js';
import { VISIBLE_FIELDS } from './schema.js';
import { loadDataset, clearDatasetCache } from './data-service.js';
import * as A from './analytics.js';
import * as C from './charts.js';
import * as UI from './ui.js';
import { esc } from './text-utils.js';
import { avatarMarkup, hydrateAvatars, clearPhotoCache } from './photos.js';
import { attachAwards, clearAwardsCache, loadAwards, nameKey, regionKey } from './awards.js';

const { $, $$ } = UI;

const FACETS = [
    { id: 'fProvinsi', key: 'provinsi', all: 'Semua Provinsi' },
    { id: 'fKabkota', key: 'kabkota', all: 'Semua Kab/Kota' },
    { id: 'fJabatan', key: 'jabatan', all: 'Semua Jabatan' },
    { id: 'fGender', key: 'gender', all: 'Semua' },
    { id: 'fPendidikan', key: 'pendidikan', all: 'Semua Jenjang' },
    { id: 'fAgama', key: 'agama', all: 'Semua Agama' },
];

const VALID_VIEWS = new Set(['overview', 'directory', 'table', 'quality']);

const state = {
    all: [],
    issues: [],
    meta: null,
    mtime: null, // <-- Untuk optimistic concurrency
    version: 0,
    filters: { q: '', provinsi: '', kabkota: '', jabatan: '', gender: '', pendidikan: '', agama: '' },
    view: 'overview',
    table: { page: 0, pageSize: APP_CONFIG.ui.tablePageSize, sortKey: 'nama', sortDir: 1 },
    dir: { shown: APP_CONFIG.ui.directoryPageSize, sort: 'nama', kabkota: '', personId: '' },
};

/* ---------- Query string <-> state ---------- */

function readUrl() {
    const p = new URLSearchParams(location.search);
    for (const k of Object.keys(state.filters)) {
        if (p.has(k)) state.filters[k] = p.get(k);
    }
    const view = p.get('view');
    if (view && VALID_VIEWS.has(view)) state.view = view;
    if (p.has('kabPage')) state.dir.kabkota = p.get('kabPage');
    if (p.has('personPage')) state.dir.personId = p.get('personPage');
}

function writeUrl({ push = false } = {}) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state.filters)) {
        if (v) p.set(k, v);
    }
    if (state.view !== 'overview') p.set('view', state.view);
    if (state.view === 'directory' && state.dir.kabkota) p.set('kabPage', state.dir.kabkota);
    if (state.view === 'directory' && state.dir.personId) p.set('personPage', state.dir.personId);
    
    const qs = p.toString();
    const next = location.pathname + (qs ? '?' + qs : '');
    if (next === location.pathname + location.search) return;

    if (push) history.pushState(null, '', next);
    else history.replaceState(null, '', next);
}

window.addEventListener('popstate', () => {
    state.dir.kabkota = '';
    state.dir.personId = '';
    readUrl();
    render({ syncUrl: false });
});

/* ---------- Seleksi data ---------- */

let _lastFilterKey = '',
    _lastResult = [];
function selectRecords() {
    const f = state.filters;
    const { sortKey, sortDir } = state.table;
    const key = JSON.stringify([state.version, f, sortKey, sortDir, state.dir.sort]);
    if (key === _lastFilterKey) return _lastResult;
    _lastFilterKey = key;

    const q = f.q.trim().toLowerCase();
    let rows = state.all.filter(
        (r) =>
            (!f.provinsi || r.provinsi === f.provinsi) &&
            (!f.kabkota || r.kabkota === f.kabkota) &&
            (!f.jabatan || r.jabatan === f.jabatan) &&
            (!f.gender || r.gender === f.gender) &&
            (!f.pendidikan || r.pendidikan === f.pendidikan) &&
            (!f.agama || r.agama === f.agama) &&
            (!q || r._search.includes(q))
    );
    rows = rows.slice().sort((a, b) => {
        const x = a[sortKey] ?? '',
            y = b[sortKey] ?? '';
        const nx = Number(x),
            ny = Number(y);
        if (x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * sortDir;
        return String(x).localeCompare(String(y), 'id') * sortDir;
    });
    _lastResult = rows;
    return rows;
}

function sortForDirectory(rows) {
    const s = state.dir.sort;
    if (s === 'kelengkapan') return rows.slice().sort((a, b) => b._completeness - a._completeness);
    return rows.slice().sort((a, b) => String(a[s] || '').localeCompare(String(b[s] || ''), 'id'));
}

function setRecords(records, { issues = state.issues, meta = state.meta, mtime = state.mtime } = {}) {
    state.all = records;
    state.issues = issues;
    state.meta = meta;
    state.mtime = mtime; // <-- Simpan mtime
    state.version += 1;
    _lastFilterKey = '';
}

/* ---------- Direktori berbasis Kabupaten/Kota ---------- */

function ensureDirectoryStyles() {
    if ($('#directoryPageStyles')) return;

    const style = document.createElement('style');
    style.id = 'directoryPageStyles';
    style.textContent = `
        #view-directory .dir-location-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 18px;
        }

        #view-directory .dir-location-card {
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 190px;
            padding: 22px;
            border: 1px solid #edf0f5;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 8px 24px rgba(15,23,42,.055);
            cursor: pointer;
            text-decoration: none;
            transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        #view-directory .dir-location-card:hover,
        #view-directory .dir-location-card:focus-visible {
            transform: translateY(-4px);
            border-color: var(--brand);
            box-shadow: 0 16px 34px rgba(15,23,42,.10);
            outline: none;
        }

        #view-directory .dir-location-kicker {
            margin-bottom: 8px;
            color: var(--muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .07em;
            text-transform: uppercase;
        }

        #view-directory .dir-location-name {
            margin: 0;
            color: var(--ink);
            font-size: 20px;
            font-weight: 750;
            line-height: 1.2;
        }

        #view-directory .dir-location-count {
            margin-top: auto;
            padding-top: 22px;
            color: var(--brand);
            font-size: 14px;
            font-weight: 700;
        }

        #view-directory .dir-location-arrow {
            position: absolute;
            right: 20px;
            bottom: 19px;
            color: var(--brand);
            font-size: 22px;
            font-weight: 700;
        }

        #view-directory .dir-location-meta {
            margin-top: 8px;
            color: var(--muted);
            font-size: 12px;
        }

        #view-directory .dir-detail-head {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 18px;
            padding: 18px 20px;
            border: 1px solid #edf0f5;
            border-radius: 18px;
            background: #fff;
            box-shadow: var(--shadow-sm);
        }

        #view-directory .dir-back {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 42px;
            height: 42px;
            padding: 0 12px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
            color: var(--ink);
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
        }

        #view-directory .dir-back:hover {
            border-color: var(--brand);
            color: var(--brand);
            background: var(--brand-soft);
        }

        #view-directory .dir-detail-title {
            min-width: 0;
            flex: 1;
        }

        #view-directory .dir-detail-title h2 {
            margin: 0;
            font-size: 20px;
        }

        #view-directory .dir-detail-title p {
            margin: 4px 0 0;
            color: var(--muted);
            font-size: 13px;
        }

        #view-directory .dir-person-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }

        #view-directory .dir-person-card {
            position: relative;
            padding: 20px;
            border: 1px solid #edf0f5;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 8px 24px rgba(15,23,42,.055);
            cursor: pointer;
            text-decoration: none;
            transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        #view-directory .dir-person-card:hover,
        #view-directory .dir-person-card:focus-visible {
            transform: translateY(-3px);
            border-color: var(--brand);
            box-shadow: 0 14px 30px rgba(15,23,42,.09);
            outline: none;
        }

        #view-directory .dir-person-top {
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }

        #view-directory .dir-person-main {
            flex: 1;
            min-width: 0;
        }

        #view-directory .dir-person-name {
            margin: 0;
            color: var(--ink);
            font-size: 15px;
            font-weight: 750;
            line-height: 1.3;
        }

        #view-directory .dir-person-role {
            margin: 3px 0 0;
            color: var(--muted);
            font-size: 12.5px;
            line-height: 1.35;
        }

        #view-directory .dir-person-score {
            padding: 4px 8px;
            border-radius: 999px;
            background: var(--brand-soft);
            color: var(--brand-dark);
            font-size: 11px;
            font-weight: 800;
        }

        #view-directory .dir-person-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 14px;
        }

        #view-directory .dir-person-tag {
            padding: 5px 9px;
            border-radius: 999px;
            background: var(--brand-soft);
            color: var(--muted);
            font-size: 11px;
            font-weight: 650;
        }

        #view-directory .dir-person-address {
            min-height: 34px;
            margin: 12px 0 0;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.45;
        }

        #view-directory .dir-person-hint {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--line);
            color: var(--brand);
            font-size: 11.5px;
            font-weight: 700;
        }

        #view-directory .dir-person-detail {
            width: 100%;
            background: #fff;
            border: 1px solid #edf0f5;
            border-radius: 20px;
            box-shadow: 0 8px 24px rgba(15,23,42,.055);
            overflow: hidden;
        }
        #view-directory .dir-person-detail-head {
            display:flex; align-items:center; gap:16px;
            padding:20px 22px; border-bottom:1px solid var(--line);
        }
        #view-directory .dir-person-detail-title { flex:1; min-width:0; }
        #view-directory .dir-person-detail-title h2 { margin:0; font-size:22px; }
        #view-directory .dir-person-detail-title p { margin:4px 0 0; color:var(--muted); font-size:13px; }
        #view-directory .dir-person-detail-actions { display:flex; gap:8px; }
        #view-directory .dir-person-detail-body { padding:22px; }
        #view-directory .dir-person-detail-grid {
            display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 28px;
        }
        #view-directory .dir-detail-row {
            display:grid; grid-template-columns:180px 1fr; gap:14px;
            padding:12px 0; border-bottom:1px solid var(--line);
        }
        #view-directory .dir-detail-label { color:var(--muted); font-size:12px; }
        #view-directory .dir-detail-value { font-size:13px; word-break:break-word; }
        #view-directory .dir-person-detail-footer {
            display:flex; justify-content:flex-end; gap:8px; margin-top:20px;
        }
        @media (max-width: 900px) {
            #view-directory .dir-person-detail-grid { grid-template-columns:1fr; }
        }
        @media (max-width: 600px) {
            #view-directory .dir-person-detail-head { align-items:flex-start; flex-wrap:wrap; }
            #view-directory .dir-person-detail-actions { width:100%; }
            #view-directory .dir-detail-row { grid-template-columns:1fr; gap:4px; }
        }

        #view-directory .dir-empty {
            grid-column: 1 / -1;
            padding: 48px 20px;
            text-align: center;
            color: var(--muted);
            background: #fff;
            border: 1px dashed var(--line);
            border-radius: 18px;
        }

        @media (max-width: 720px) {
            #view-directory .dir-location-grid,
            #view-directory .dir-person-grid {
                grid-template-columns: 1fr;
            }

            #view-directory .dir-detail-head {
                align-items: flex-start;
            }
        }
    `;
    document.head.appendChild(style);
}

function renderDirectoryLocations(rows) {
    ensureDirectoryStyles();

    const head = $('#view-directory .panel__head--bare');
    const grid = $('#dirGrid');
    const more = $('#btnMore');

    head.innerHTML = `
        <h2>Direktori Personel <span class="muted">(${rows.length} orang)</span></h2>
        <div class="seg">
            <label for="dirSort" class="sr-only">Urutkan</label>
            <select id="dirSort">
                <option value="nama">Urut: Nama (A–Z)</option>
                <option value="provinsi">Urut: Provinsi</option>
                <option value="jabatan">Urut: Jabatan</option>
                <option value="kelengkapan">Urut: Kelengkapan data</option>
            </select>
        </div>
    `;

    const groups = new Map();
    rows.forEach((r) => {
        const key = String(r.kabkota || '').trim() || 'Kab/Kota Belum Diisi';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    });

    const locations = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));

    grid.className = 'dir-grid dir-location-grid';
    grid.innerHTML = locations.length
        ? locations.map(([kab, people]) => {
            const provinces = [...new Set(people.map((r) => r.provinsi).filter(Boolean))];
            const provinceText = provinces.length === 1 ? provinces[0] : provinces.join(', ');
            const params = new URLSearchParams(location.search);
            params.set('view', 'directory');
            params.set('kabPage', kab);
            return `
                <a class="dir-location-card"
                    href="?${params.toString()}"
                    aria-label="Buka direktori ${esc(kab)}">
                    <div class="dir-location-kicker">Kabupaten / Kota</div>
                    <h3 class="dir-location-name">${esc(kab)}</h3>
                    <div class="dir-location-meta">${esc(provinceText || 'Provinsi belum diisi')}</div>
                    <div class="dir-location-count">${people.length} Personel</div>
                    <span class="dir-location-arrow" aria-hidden="true">→</span>
                </a>
            `;
        }).join('')
        : '<div class="dir-empty">Tidak ada Kabupaten/Kota pada data yang sedang dipilih.</div>';

    more.hidden = true;
}

function renderDirectoryPersonDetail(rows) {
    ensureDirectoryStyles();

    const rec = state.all.find((r) => r._id === state.dir.personId);
    const head = $('#view-directory .panel__head--bare');
    const grid = $('#dirGrid');
    const more = $('#btnMore');
    if (!rec) {
        state.dir.personId = '';
        renderDirectoryKabupaten(rows);
        return;
    }

    const kab = state.dir.kabkota || rec.kabkota || '';
    const province = rec.provinsi || 'Provinsi belum diisi';
    const backParams = new URLSearchParams();
    backParams.set('view', 'directory');
    if (kab) backParams.set('kabPage', kab);

    head.innerHTML = `
        <div class="dir-detail-head" style="width:100%; margin:0;">
            <a class="dir-back" href="?${backParams.toString()}" aria-label="Kembali ke ${esc(kab)}">←</a>
            <div class="dir-detail-title">
                <h2>Detail Personel <span class="muted">· ${esc(rec.nama || 'Tanpa Nama')}</span></h2>
                <p>${esc(province)} · ${esc(kab || 'Kab/Kota belum diisi')}</p>
            </div>
        </div>
    `;

    const rowsHtml = VISIBLE_FIELDS.map((f) => {
        const value = rec[f.key] ?? '';
        return `
            <div class="dir-detail-row">
                <div class="dir-detail-label">${esc(f.label)}</div>
                <div class="dir-detail-value">${esc(value || '—')}</div>
            </div>
        `;
    }).join('');

    grid.className = '';
    grid.innerHTML = `
        <article class="dir-person-detail">
            <div class="dir-person-detail-head" style="display:flex !important;flex-direction:column !important;align-items:center !important;justify-content:center !important;text-align:center !important;gap:18px !important;width:100% !important;padding:40px 20px 30px !important;">
                ${avatarMarkup(rec, { size: 'xl' })}
                <div class="dir-person-detail-title" style="width:100% !important;min-width:0 !important;flex:none !important;text-align:center !important;">
                    <h2 style="margin:0 !important;font-size:34px !important;text-align:center !important;">${esc(rec.nama || 'Tanpa Nama')}</h2>
                    <p style="margin:8px 0 0 !important;font-size:17px !important;text-align:center !important;">${esc(rec.jabatan || 'Jabatan belum diisi')} · ${Math.round(Number(rec._completeness || 0))}% kelengkapan</p>
                </div>
            </div>
            <div class="dir-person-detail-body">
                <div class="dir-person-detail-grid">${rowsHtml}</div>
                ${UI.awardsSectionHtml(rec)}
                <div class="dir-person-detail-footer">
                    <a class="btn btn--ghost" href="?${backParams.toString()}">← Kembali ke ${esc(kab || 'Direktori')}</a>
                    <button class="btn btn--primary" type="button" id="dirEditPerson" data-id="${esc(rec._id)}">✎ Edit Data</button>
                </div>
            </div>
        </article>
    `;
    hydrateAvatars(grid);
    more.hidden = true;

    const editBtn = $('#dirEditPerson');
    if (editBtn) editBtn.onclick = () => openModal(rec._id);
}

function renderDirectoryKabupaten(rows) {
    ensureDirectoryStyles();

    const kab = state.dir.kabkota;
    const districtRows = rows.filter((r) => (String(r.kabkota || '').trim() || 'Kab/Kota Belum Diisi') === kab);
    const sorted = sortForDirectory(districtRows);

    const head = $('#view-directory .panel__head--bare');
    const grid = $('#dirGrid');
    const more = $('#btnMore');

    const province = [...new Set(sorted.map((r) => r.provinsi).filter(Boolean))];
    const provinceText = province.length ? province.join(', ') : 'Provinsi belum diisi';

    head.innerHTML = `
        <div class="dir-detail-head" style="width:100%; margin:0;">
            <a class="dir-back" href="?view=directory" aria-label="Kembali ke daftar Kabupaten/Kota">←</a>
            <div class="dir-detail-title">
                <h2>Direktori ${esc(kab)} <span class="muted">(${sorted.length} orang)</span></h2>
                <p>${esc(provinceText)} · Daftar personel khusus ${esc(kab)}</p>
            </div>
        </div>
    `;

    grid.className = 'dir-grid dir-person-grid';
    grid.innerHTML = sorted.length
        ? sorted.map((r) => {
            const params = new URLSearchParams();
            params.set('view', 'directory');
            params.set('kabPage', kab);
            params.set('personPage', r._id);
            return `
            <a class="dir-person-card" href="?${params.toString()}" aria-label="Buka detail ${esc(r.nama)}">
                <div class="dir-person-top">
                    ${avatarMarkup(r, { size: 'lg' })}
                    <div class="dir-person-main">
                        <h3 class="dir-person-name">${esc(r.nama || 'Tanpa Nama')}</h3>
                        <p class="dir-person-role">${esc(r.jabatan || 'Jabatan belum diisi')}</p>
                    </div>
                    <span class="dir-person-score">${Math.round(Number(r._completeness || 0))}%</span>
                </div>
                <div class="dir-person-tags">
                    ${r.pendidikan ? `<span class="dir-person-tag">${esc(r.pendidikan)}</span>` : ''}
                    ${r.gender ? `<span class="dir-person-tag">${esc(r.gender)}</span>` : ''}
                    ${r.div ? `<span class="dir-person-tag">${esc(r.div)}</span>` : ''}
                </div>
                <p class="dir-person-address">${esc(r.alamat || 'Alamat belum diisi')}</p>
                <div class="dir-person-hint">Lihat detail personel →</div>
            </a>
        `;}).join('')
        : '<div class="dir-empty">Tidak ada personel pada Kabupaten/Kota ini.</div>';

    hydrateAvatars(grid);
    more.hidden = true;
}

function renderDirectory(rows) {
    if (state.dir.personId) renderDirectoryPersonDetail(rows);
    else if (state.dir.kabkota) renderDirectoryKabupaten(rows);
    else renderDirectoryLocations(rows);
}

function updateFilterVisibility() {
    const filterBar = $('#filterBar');
    if (!filterBar) return;

    const isKabupatenPage = state.view === 'directory' && (Boolean(state.dir.kabkota) || Boolean(state.dir.personId));
    filterBar.hidden = isKabupatenPage;
}

function clampTablePage(total) {
    const pages = Math.max(1, Math.ceil(total / state.table.pageSize));
    state.table.page = Math.min(Math.max(0, state.table.page), pages - 1);
    return pages;
}

/* ---------- Render ---------- */

/**
 * Progressive chart rendering: render chart secara bertahap untuk menghindari blocking UI.
 * Chart di-render dalam batch dengan delay kecil menggunakan requestIdleCallback.
 */
async function renderCharts(rows) {
    // Pastikan Chart.js sudah dimuat
    try {
        await C.ensureChartLib();
    } catch (err) {
        console.error('[app] Gagal memuat Chart.js:', err);
        UI.toast('Grafik tidak dapat ditampilkan. Periksa koneksi internet.', 'warn');
        return;
    }
    
    C.applyDefaults();
    
    // Data preparation (sync, cepat)
    const prov = A.countBy(rows, 'provinsi');
    const kabkota = A.countBy(rows, 'kabkota');
    const gender = A.countBy(rows, 'gender');
    const pendidikan = A.countBy(rows, 'pendidikan', { sort: 'label' });
    const jabatan = A.countBy(rows, 'jabatan', { limit: APP_CONFIG.ui.topJabatan });
    const divisi = A.countBy(rows, 'div');
    const agama = A.countBy(rows, 'agama');
    const kelengkapan = A.completeness(rows);
    const silang = A.crossTab(rows, 'provinsi', 'pendidikan', { rowLimit: 12 });
    
    // Update hint text (instant)
    const hintProv = $('#hintProv');
    if (hintProv) hintProv.textContent = prov.labels.length + ' provinsi';
    const hintKabkota = $('#hintKabkota');
    if (hintKabkota) hintKabkota.textContent = kabkota.labels.length + ' kab/kota';
    
    // Batch 1: Chart penting (above the fold)
    const renderBatch1 = () => {
        C.barChart('chProvinsi', prov, { horizontal: prov.labels.length > 7 });
        C.barChart('chKabkota', kabkota, { horizontal: kabkota.labels.length > 7 });
    };
    
    // Batch 2: Chart sekunder
    const renderBatch2 = () => {
        C.donutChart('chGender', gender);
        C.donutChart('chPendidikan', pendidikan);
        C.barChart('chJabatan', jabatan, { horizontal: true, color: C.PALETTE[1] });
    };
    
    // Batch 3: Chart tambahan
    const renderBatch3 = () => {
        C.barChart('chPenugasan', divisi, { color: C.PALETTE[4], horizontal: true });
        C.barChart('chAgama', agama, { color: C.PALETTE[2] });
        C.percentBar('chKelengkapan', kelengkapan);
        C.stackedBar('chSilang', silang);
    };
    
    // Render secara progresif menggunakan requestIdleCallback atau setTimeout
    const scheduleRender = (fn, delay = 0) => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(fn, { timeout: delay + 100 });
        } else {
            setTimeout(fn, delay);
        }
    };
    
    // Render batch 1 immediately (penting)
    renderBatch1();
    
    // Render batch 2 dan 3 saat browser idle
    scheduleRender(renderBatch2, 50);
    scheduleRender(renderBatch3, 100);
}

async function render({ syncUrl = true } = {}) {
    const rows = selectRecords();

    FACETS.forEach(({ id, key, all }) => {
        const values = [...new Set(state.all.map((r) => r[key]).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'id')
        );
        UI.fillFacet($('#' + id), values, state.filters[key], all);
    });
    const searchInput = $('#fSearch');
    if (searchInput) searchInput.value = state.filters.q;

    if (state.view === 'overview') {
        // Render KPI dulu (instant, non-blocking)
        UI.renderKpis(A.kpis(rows, state.all));
        
        // Chart di-render secara async dan progresif
        renderCharts(rows);
    } else {
        C.destroyAll();
    }

    if (state.view === 'directory') {
        const dirCount = $('#dirCount');
        if (dirCount) dirCount.textContent = '(' + rows.length + ' orang)';
        renderDirectory(rows);
    } else if (state.view === 'table') {
        clampTablePage(rows.length);
        UI.renderTable(rows, state.table.page, state.table.pageSize, {
            sortKey: state.table.sortKey,
            sortDir: state.table.sortDir,
        });
    } else if (state.view === 'quality') {
        UI.renderQuality(state.issues, state.meta);
    }

    // Update tab visual status
    $$('.tab').forEach((t) => {
        const isCurrent = t.dataset.view === state.view;
        t.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    updateFilterVisibility();
    if (syncUrl) writeUrl();
    return rows;
}

function switchView(view) {
    if (!VALID_VIEWS.has(view)) view = 'overview';
    state.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    $$('.view').forEach((s) => {
        s.hidden = s.dataset.view !== view;
    });
    render();
}

/* ---------- Ekspor ---------- */

async function exportExcel(rows) {
    let xlsxLib = window.XLSX;
    if (!xlsxLib) {
        UI.toast('Menyiapkan library ekspor...', 'info');
        try {
            xlsxLib = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/mjs/xlsx.mjs');
        } catch (e) {
            UI.toast('Gagal memuat library ekspor. Pastikan Anda terhubung ke internet.', 'error');
            return;
        }
    }
    
    const data = rows.map((r) => {
        const obj = {};
        VISIBLE_FIELDS.forEach((f) => {
            obj[f.label] = r[f.key] ?? '';
        });
        return obj;
    });
    const ws = xlsxLib.utils.json_to_sheet(data);
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, "Data Personel");

    const awardRows = rows.flatMap((r) =>
        (r._awards || []).map((a) => ({
            'Kab/Kota': r.kabkota || a.kabkota,
            Nama: r.nama || a.nama,
            Jabatan: r.jabatan || a.jabatan,
            'Kordinator Divisi': a.kordiv,
            Wakordiv: a.wakordiv,
            'Jenis Penghargaan': a.penghargaan,
            Kategori: a.kategori,
            'Link Bukti': a.bukti,
        }))
    );
    if (awardRows.length) {
        xlsxLib.utils.book_append_sheet(wb, xlsxLib.utils.json_to_sheet(awardRows), 'Penghargaan');
    }
    xlsxLib.writeFile(wb, 'personel-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    UI.toast('Berhasil mengekspor ' + rows.length + ' baris ke Excel.', 'success');
}

/* ---------- Event binding ---------- */

function debounce(fn, ms = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

/* ---------- CRUD Logic ---------- */
let currentAwardsList = [];
let pendingPhotoFile = null;
let currentPersonId = null;
let currentPersonName = '';

function renderAwardsForm() {
    const container = $('#awardsContainer');
    if (!container) return;
    
    container.innerHTML = currentAwardsList.length === 0 
        ? '<p class="muted" style="font-size: 13px; margin: 0; padding: 12px; text-align: center; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted);">Belum ada penghargaan. Klik tombol di bawah untuk menambahkan.</p>'
        : currentAwardsList.map((aw, idx) => `
            <div class="award-card" data-index="${idx}">
                <div class="award-card__header">
                    <div class="award-card__badge">#${idx + 1}</div>
                    <div class="award-card__title">${esc(aw.penghargaan || 'Belum diisi')}</div>
                    <div class="award-card__actions">
                        <button type="button" class="btn-icon-edit btn-edit-award" data-index="${idx}" title="Edit Penghargaan">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button type="button" class="btn-icon-delete btn-remove-award" data-index="${idx}" title="Hapus Penghargaan">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="award-card__body ${aw._editing ? 'is-editing' : ''}">
                    ${aw._editing ? `
                        <div class="field">
                            <label>Nama Penghargaan</label>
                            <input type="text" class="aw-name" value="${esc(aw.penghargaan || '')}" placeholder="Contoh: Narasumber Sosialisasi Pemilu 2024" required />
                        </div>
                        <div class="field">
                            <label>Bukti PDF</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="file" class="aw-file" accept=".pdf" style="flex: 1;" />
                                ${aw.bukti ? `<span class="file-indicator">File tersimpan</span>` : ''}
                            </div>
                            ${aw.bukti ? `<small class="muted">File saat ini: ${aw.bukti.split('/').pop()}</small>` : ''}
                        </div>
                        <div class="award-card__edit-actions">
                            <button type="button" class="btn btn--ghost btn-cancel-edit" data-index="${idx}">Batal</button>
                            <button type="button" class="btn btn--primary btn-save-edit" data-index="${idx}">Simpan</button>
                        </div>
                    ` : `
                        <div class="award-card__info">
                            ${aw.bukti ? `
                                <a href="${esc(aw.bukti)}" target="_blank" class="award-card__link">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                    Lihat Bukti PDF
                                </a>
                            ` : `
                                <span class="award-card__no-proof">Belum ada bukti</span>
                            `}
                        </div>
                    `}
                </div>
            </div>
        `).join('');
}

function openModal(id = null) {
    const form = $('#dataForm');
    if (!form) return;
    form.reset();
    $('#formRowId').value = '';
    $('#modalTitle').textContent = id ? 'Edit Data' : 'Tambah Data';
    
    // Reset foto - tampilkan avatar dengan inisial
    pendingPhotoFile = null;
    const photoPreview = $('#photoPreview');
    if (!photoPreview) return;
    
    let photoImg = photoPreview.querySelector('.avatar__img');
    let initials = photoPreview.querySelector('.avatar__initials');
    
    // Remove existing img if any
    if (photoImg) {
        photoImg.remove();
        photoImg = null;
    }
    
    // Ensure initials element exists
    if (!initials) {
        initials = document.createElement('span');
        initials.className = 'avatar__initials';
        initials.style.fontSize = '48px';
        initials.style.fontWeight = '700';
        initials.style.color = 'var(--brand)';
        photoPreview.appendChild(initials);
    }
    
    photoPreview.style.display = 'flex';
    initials.style.display = 'flex';
    $('#iFotoPath').value = '';
    
    currentAwardsList = [];
    currentPersonId = id;
    currentPersonName = '';

    if (id) {
        const rec = state.all.find((r) => r._id === id);
        if (rec) {
            console.log('[openModal] Record:', rec.nama, 'Foto:', rec.foto);
            
            currentPersonName = rec.nama || '';
            $('#formRowId').value = id;
            $('#iNama').value = rec.nama || '';
            $('#iProvinsi').value = rec.provinsi || '';
            $('#iKabkota').value = rec.kabkota || '';
            $('#iGender').value = rec.gender || '';
            $('#iAgama').value = rec.agama || '';
            $('#iPendidikan').value = rec.pendidikan || '';
            $('#iJabatan').value = rec.jabatan || '';
            $('#iWakordiv').value = rec.wakordiv || '';
            $('#iDiv').value = rec.div || '';
            $('#iAmj').value = rec.amj || '';
            $('#iHp').value = rec.hp || '';
            $('#iEmailK').value = rec.emailK || '';
            $('#iEmailP').value = rec.emailP || '';
            $('#iAlamat').value = rec.alamat || '';
            $('#iFacebook').value = rec.facebook || '';
            $('#iInstagram').value = rec.instagram || '';
            $('#iWebsite').value = rec.website || '';
            $('#iFotoPath').value = rec.foto || '';
            
            // Update inisial
            const namaValue = rec.nama || '';
            initials.textContent = UI.initials(namaValue);
            
            // Set foto preview jika ada - PERBAIKAN: Load setelah semua field di-set
            if (rec.foto && rec.foto.trim()) {
                console.log('[openModal] Loading foto:', rec.foto);
                
                // Hide initials immediately
                initials.style.display = 'none';
                
                const img = document.createElement('img');
                img.className = 'avatar__img';
                img.alt = 'Preview';
                img.style.position = 'absolute';
                img.style.inset = '0';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                
                img.onload = () => {
                    console.log('[openModal] Foto loaded successfully');
                };
                
                img.onerror = (e) => {
                    console.error('[openModal] Foto gagal dimuat:', rec.foto, e);
                    img.remove();
                    initials.style.display = 'flex';
                };
                
                photoPreview.style.position = 'relative';
                photoPreview.appendChild(img);
                
                // Set src AFTER appending to DOM
                img.src = rec.foto;
            } else {
                console.log('[openModal] Tidak ada foto, tampilkan inisial');
                initials.style.display = 'flex';
            }

            // Copy awards
            if (rec._awards) {
                currentAwardsList = rec._awards.map(a => ({ ...a }));
            }
        }
    } else {
        // Mode tambah data baru - tampilkan inisial default
        initials.textContent = 'MA';
        photoPreview.style.display = 'flex';
    }
    
    renderAwardsForm();
    $('#modalForm').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const m = $('#modalForm');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
}

async function handlePhotoUpload(nama) {
    if (!pendingPhotoFile) return $('#iFotoPath').value;
    
    const formData = new FormData();
    formData.append('photo', pendingPhotoFile);
    formData.append('nama', nama);
    
    try {
        const res = await fetch('/api/upload-photo', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.ok) return data.path;
        UI.toast('Gagal upload foto: ' + data.error, 'warn');
        return $('#iFotoPath').value;
    } catch (e) {
        console.error(e);
        UI.toast('Kesalahan koneksi saat upload foto.', 'warn');
        return $('#iFotoPath').value;
    }
}

async function handlePhotoRename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    try {
        await fetch('/api/rename-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName, newName })
        });
    } catch (e) {
        console.error('Gagal rename foto', e);
    }
}

async function saveAwardsList(kabkota, nama, jabatan) {
    const newAwards = [];
    
    // Process dari currentAwardsList (bukan dari DOM)
    for (let i = 0; i < currentAwardsList.length; i++) {
        const award = currentAwardsList[i];
        let bukti = award.bukti || '';
        
        // Upload file jika ada pending file
        if (award._pendingFile) {
            const formData = new FormData();
            formData.append('proof', award._pendingFile);
            formData.append('nama', nama);
            formData.append('kabkota', kabkota);
            try {
                const res = await fetch('/api/upload-proof', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.ok) bukti = data.path;
            } catch (e) {
                console.error('Gagal upload bukti', e);
                UI.toast('Gagal upload bukti penghargaan ' + (i + 1), 'warn');
            }
        }

        newAwards.push({
            kabkota: kabkota,
            nama: nama,
            jabatan: jabatan,
            penghargaan: award.penghargaan,
            bukti: bukti,
            kategori: award.kategori || '' // Pertahankan kategori lama atau auto-detect nanti
        });
    }

    // Ambil data penghargaan.json, ubah entri untuk orang ini
    try {
        const res = await fetch('/data/penghargaan.json?t=' + Date.now());
        const allAwards = await res.json();
        
        const targetRegion = regionKey(kabkota);
        const targetName = nameKey(nama);
        const oldTargetName = nameKey(currentPersonName);
        
        // Hapus data lama orang ini
        const filtered = allAwards.filter(a => {
            const r = regionKey(a.kabkota || a['Kab/Kota']);
            const n = nameKey(a.nama || a.Nama);
            if (r === targetRegion && (n === targetName || n === oldTargetName)) return false;
            return true;
        });
        
        // Tambahkan data baru
        const finalAwards = [...filtered, ...newAwards];
        
        await fetch('/api/save-awards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ awards: finalAwards })
        });
    } catch (e) {
        console.error('Gagal menyimpan penghargaan', e);
    }
}

async function saveData() {
    UI.showState('loading', 'Menyimpan data...');
    const id = $('#formRowId').value;
    const newNama = $('#iNama').value;
    const newKabkota = $('#iKabkota').value;
    
    // Handle rename & upload foto
    if (id && currentPersonName && currentPersonName !== newNama) {
        await handlePhotoRename(currentPersonName, newNama);
    }
    const finalFotoPath = await handlePhotoUpload(newNama);
    
    // Handle awards
    await saveAwardsList(newKabkota, newNama, $('#iJabatan').value);
    
    const newData = {
        nama: newNama,
        provinsi: $('#iProvinsi').value,
        kabkota: newKabkota,
        gender: $('#iGender').value,
        agama: $('#iAgama').value,
        pendidikan: $('#iPendidikan').value,
        jabatan: $('#iJabatan').value,
        wakordiv: $('#iWakordiv').value,
        div: $('#iDiv').value,
        amj: $('#iAmj').value,
        hp: $('#iHp').value,
        emailK: $('#iEmailK').value,
        emailP: $('#iEmailP').value,
        alamat: $('#iAlamat').value,
        facebook: $('#iFacebook').value,
        instagram: $('#iInstagram').value,
        website: $('#iWebsite').value,
        foto: finalFotoPath,
        _search: [newNama, $('#iJabatan').value, $('#iProvinsi').value, newKabkota].join(' ').toLowerCase()
    };

    if (id) {
        const index = state.all.findIndex((r) => r._id === id);
        if (index !== -1) {
            state.all[index] = { ...state.all[index], ...newData };
        }
    } else {
        const newId = 'row-new-' + Date.now();
        const newRecord = { 
            _id: newId, 
            _rowNumber: state.all.length ? Math.max(...state.all.map((r) => r._rowNumber)) + 1 : 1,
            _completeness: 80,
            ...newData 
        };
        state.all.unshift(newRecord);
    }

    const saved = await syncToServer();
    if (!saved) {
        // syncToServer sudah tampilkan error/konflik, jangan tutup modal
        UI.showState('hidden');
        return;
    }
    
    closeModal();
    // Panggil reload supaya data penghargaan termuat kembali dan ngelink dengan benar
    await reload({ force: true });
    UI.toast('Data berhasil disimpan.', 'success');
}

async function syncToServer() {
    try {
        const rows = state.all.map((r) => {
            const obj = {};
            // Schema FOTO tidak visible secara default, jadi kita harus sertakan explicitly
            // karena ada field.hidden = true pada foto
            VISIBLE_FIELDS.forEach((f) => {
                obj[f.key] = r[f.key] ?? '';
            });
            // Manual assign hidden fields
            obj['foto'] = r.foto ?? '';
            return obj;
        });
        
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, baseMtime: state.mtime })
        });
        const resData = await response.json();
        
        if (response.status === 409) {
            // Conflict: data sudah berubah oleh pengguna lain
            const shouldReload = window.confirm(
                resData.error + '\n\n' + 
                (resData.hint || 'Muat ulang data dulu, lalu ulangi perubahan Anda.') + 
                '\n\nKlik OK untuk muat ulang data sekarang.'
            );
            if (shouldReload) {
                await reload({ force: true });
            }
            return false;
        }
        
        if (!response.ok) {
            UI.toast('Gagal menyimpan ke file Excel: ' + (resData.error || 'Unknown error'), 'error');
            return false;
        }
        
        // Update mtime setelah berhasil simpan
        if (resData.mtime) {
            state.mtime = resData.mtime;
        }
        
        return true;
    } catch (e) {
        console.error(e);
        UI.toast('Kesalahan koneksi saat menyimpan.', 'error');
        return false;
    }
}


function bindEvents() {
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
        if (tab.dataset.view === 'directory') { state.dir.kabkota = ''; state.dir.personId = ''; }
        switchView(tab.dataset.view);
    }));

    $('#fSearch').addEventListener(
        'input',
        debounce((e) => {
            state.filters.q = e.target.value;
            state.table.page = 0;
            state.dir.shown = APP_CONFIG.ui.directoryPageSize;
            render();
        }, 220)
    );

    FACETS.forEach(({ id, key }) => {
        $('#' + id).addEventListener('change', (e) => {
            state.filters[key] = e.target.value;
            state.table.page = 0;
            render();
        });
    });

    $('#btnReset').addEventListener('click', () => {
        Object.keys(state.filters).forEach((k) => {
            state.filters[k] = '';
        });
        state.table.page = 0;
        render();
        UI.toast('Filter dikosongkan.');
    });

    $('#btnExport').addEventListener('click', () => exportExcel(selectRecords()));
    $('#btnRefresh').addEventListener('click', () => reload({ force: true }));

    $('#grid thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.key) return;
        const key = th.dataset.key;
        state.table.sortDir = state.table.sortKey === key ? -state.table.sortDir : 1;
        state.table.sortKey = key;
        render();
    });

    $('#prevPage').addEventListener('click', () => {
        state.table.page -= 1;
        render();
    });
    $('#nextPage').addEventListener('click', () => {
        state.table.page += 1;
        render();
    });
    $('#pageSize').addEventListener('change', (e) => {
        state.table.pageSize = Number(e.target.value);
        state.table.page = 0;
        render();
    });

    $('#view-directory').addEventListener('change', (e) => {
        if (e.target.id === 'dirSort') {
            state.dir.sort = e.target.value;
            render();
        }
    });

    $('#view-directory').addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link || !link.getAttribute('href')?.startsWith('?')) return;
        e.preventDefault();
        const url = new URL(link.href, window.location.href);
        state.dir.kabkota = url.searchParams.get('kabPage') || '';
        state.dir.personId = url.searchParams.get('personPage') || '';
        const view = url.searchParams.get('view');
        if (view && VALID_VIEWS.has(view)) state.view = view;
        writeUrl({ push: true });
        render({ syncUrl: false });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Delegasi klik tabel (pengganti onclick inline)
    $('#grid').addEventListener('click', (e) => {
        if (e.target.closest('.chk-col') || e.target.closest('a') || e.target.closest('button')) return;
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const rec = state.all.find((r) => r._id === tr.dataset.id);
        if (rec) UI.openDrawer(rec);
    });

    $('#grid').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        e.preventDefault();
        const rec = state.all.find((r) => r._id === tr.dataset.id);
        if (rec) UI.openDrawer(rec);
    });

    $('#drawer').addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close')) UI.closeDrawer();
        
        const btnEdit = e.target.closest('#btnEditData');
        if (btnEdit) {
            UI.closeDrawer();
            openModal(btnEdit.dataset.id);
        }
    });

    $('#modalForm')?.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close-modal')) closeModal();
        
        // Edit award button
        if (e.target.closest('.btn-edit-award')) {
            const btn = e.target.closest('.btn-edit-award');
            const idx = parseInt(btn.dataset.index, 10);
            currentAwardsList[idx]._editing = true;
            renderAwardsForm();
            return;
        }
        
        // Cancel edit
        if (e.target.closest('.btn-cancel-edit')) {
            const btn = e.target.closest('.btn-cancel-edit');
            const idx = parseInt(btn.dataset.index, 10);
            currentAwardsList[idx]._editing = false;
            renderAwardsForm();
            return;
        }
        
        // Save edit
        if (e.target.closest('.btn-save-edit')) {
            const btn = e.target.closest('.btn-save-edit');
            const idx = parseInt(btn.dataset.index, 10);
            const card = btn.closest('.award-card');
            const nameInput = card.querySelector('.aw-name');
            const fileInput = card.querySelector('.aw-file');
            
            if (!nameInput.value.trim()) {
                UI.toast('Nama penghargaan tidak boleh kosong', 'warn');
                return;
            }
            
            currentAwardsList[idx].penghargaan = nameInput.value.trim();
            
            // Handle file upload nanti saat save form
            if (fileInput && fileInput.files.length > 0) {
                currentAwardsList[idx]._pendingFile = fileInput.files[0];
            }
            
            currentAwardsList[idx]._editing = false;
            renderAwardsForm();
            UI.toast('Perubahan disimpan (akan diupload saat save form)', 'success');
            return;
        }
        
        // Remove award button
        if (e.target.closest('.btn-remove-award')) {
            const btn = e.target.closest('.btn-remove-award');
            const idx = parseInt(btn.dataset.index, 10);
            
            if (!confirm('Yakin ingin menghapus penghargaan ini?')) return;
            
            currentAwardsList.splice(idx, 1);
            renderAwardsForm();
            UI.toast('Penghargaan dihapus', 'success');
            return;
        }
    });
    
    $('#btnAddAward')?.addEventListener('click', () => {
        currentAwardsList.push({ 
            penghargaan: '', 
            bukti: '', 
            kategori: '',
            _editing: true // Langsung mode edit untuk entry baru
        });
        renderAwardsForm();
        
        // Focus ke input nama
        setTimeout(() => {
            const lastCard = $('#awardsContainer .award-card:last-child');
            if (lastCard) {
                const nameInput = lastCard.querySelector('.aw-name');
                if (nameInput) nameInput.focus();
            }
        }, 100);
    });

    $('#iFotoFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const photoPreview = $('#photoPreview');
        if (!photoPreview) return;
        
        let photoImg = photoPreview.querySelector('.avatar__img');
        let initials = photoPreview.querySelector('.avatar__initials');
        
        if (file) {
            pendingPhotoFile = file;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                // Remove existing img if any
                if (photoImg) {
                    photoImg.remove();
                }
                
                // Create new img
                const img = document.createElement('img');
                img.className = 'avatar__img';
                img.alt = 'Preview';
                img.src = e.target.result;
                img.style.position = 'absolute';
                img.style.inset = '0';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                
                photoPreview.style.position = 'relative';
                photoPreview.appendChild(img);
                
                if (initials) {
                    initials.style.display = 'none';
                }
            };
            reader.readAsDataURL(file);
        } else {
            pendingPhotoFile = null;
            if (photoImg) {
                photoImg.remove();
            }
            if (initials) {
                initials.style.display = 'flex';
            }
        }
    });

    $('#dataForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveData();
    });

    $('#btnAddData')?.addEventListener('click', () => {
        openModal();
    });

    $('#btnDeleteMode')?.addEventListener('click', () => {
        $('#grid').classList.add('delete-mode');
        $('#btnAddData').hidden = true;
        $('#btnDeleteMode').hidden = true;
        $('#btnCancelDelete').hidden = false;
        $('#btnConfirmDelete').hidden = false;
    });

    $('#btnCancelDelete')?.addEventListener('click', () => {
        $('#grid').classList.remove('delete-mode');
        $('#btnAddData').hidden = false;
        $('#btnDeleteMode').hidden = false;
        $('#btnCancelDelete').hidden = true;
        $('#btnConfirmDelete').hidden = true;
        
        $$('.chk-row').forEach(c => c.checked = false);
        const chkAll = $('#chkAll');
        if (chkAll) chkAll.checked = false;
    });

    $('#btnConfirmDelete')?.addEventListener('click', () => {
        const checked = $$('.chk-row:checked');
        if (!checked.length) {
            UI.toast('Pilih minimal satu baris data untuk dihapus.', 'warn');
            return;
        }
        if (window.confirm('Yakin ingin menghapus ' + checked.length + ' data terpilih?')) {
            const idsToDelete = new Set(checked.map((c) => c.value));
            const updated = state.all.filter((r) => !idsToDelete.has(r._id));
            setRecords(updated);
            state.table.page = 0;
            
            $('#grid').classList.remove('delete-mode');
            $('#btnAddData').hidden = false;
            $('#btnDeleteMode').hidden = false;
            $('#btnCancelDelete').hidden = true;
            $('#btnConfirmDelete').hidden = true;

            render();
            syncToServer();
        }
    });

    // Checkbox select all
    $('#grid thead').addEventListener('change', (e) => {
        if (e.target.id === 'chkAll') {
            const isChecked = e.target.checked;
            $$('.chk-row').forEach(c => c.checked = isChecked);
        }
    });

    $('#grid tbody').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-row')) {
            const total = $$('.chk-row').length;
            const checked = $$('.chk-row:checked').length;
            const chkAll = $('#chkAll');
            if (chkAll) chkAll.checked = (total > 0 && total === checked);
        }
    });
}

/* ---------- Bootstrap & Reload ---------- */

async function reload({ force = false } = {}) {
    if (force) {
        clearDatasetCache();
        clearPhotoCache();
        clearAwardsCache();
    }
    UI.showState(
        'loading',
        force ? 'Mengambil versi terbaru berkas data…' : 'Memuat data dari ' + APP_CONFIG.dataSource.url + ' …'
    );
    try {
        // OPTIMASI: Load dataset dan awards secara parallel
        const [{ records, issues, meta, mtime, fromCache }, awards] = await Promise.all([
            loadDataset({ force }),
            loadAwards({ force })
        ]);
        
        const linkage = attachAwards(records, awards);
        setRecords(records, { issues, meta, mtime }); // <-- Pass mtime

        const appName = $('#appName');
        const appOrg = $('#appOrg');
        const sourceBadge = $('#sourceBadge');
        if (appName) appName.textContent = APP_CONFIG.appName;
        if (appOrg) appOrg.textContent = APP_CONFIG.orgName;
        if (sourceBadge) {
            sourceBadge.textContent =
                meta.sheetName + ' · ' + meta.rowCount + ' baris' + (fromCache ? ' (cache)' : '');
        }

        UI.showState('hidden');
        updateFilterVisibility();
        switchView(state.view);
        render();

        if (meta.unmappedColumns > 0) {
            UI.toast(meta.unmappedColumns + ' kolom pada berkas tidak dikenali dan diabaikan.', 'warn');
        }
        if (linkage.unmatched.length) {
            UI.toast(
                linkage.unmatched.length +
                    ' penghargaan belum cocok dengan personel mana pun. Periksa ejaan nama pada data/penghargaan.json.',
                'warn'
            );
        }
    } catch (err) {
        UI.showError(err);
        $('#filterBar').hidden = true;
        console.error(err);
    }
}

function start() {
    // Chart.js sekarang dimuat secara lazy, tidak perlu dicek di sini
    readUrl();
    bindEvents();
    reload();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
