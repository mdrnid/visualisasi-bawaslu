/** Komposisi aplikasi: state, filter, sinkronisasi URL, dan orkestrasi render. */
import { APP_CONFIG } from './config.js';
import { FIELDS } from './schema.js';
import { loadDataset, DataError } from './data-service.js';
import * as A from './analytics.js';
import * as C from './charts.js';
import * as UI from './ui.js';

const { $, $$ } = UI;

const FACETS = [
    { id: 'fProvinsi', key: 'provinsi', all: 'Semua Provinsi' },
    { id: 'fKabkota', key: 'kabkota', all: 'Semua Kab/Kota' },
    { id: 'fJabatan', key: 'jabatan', all: 'Semua Jabatan' },
    { id: 'fGender', key: 'gender', all: 'Semua' },
    { id: 'fPendidikan', key: 'pendidikan', all: 'Semua Jenjang' },
    { id: 'fAgama', key: 'agama', all: 'Semua Agama' },
];

const state = {
    all: [], issues: [], meta: null,
    filters: { q: '', provinsi: '', kabkota: '', jabatan: '', gender: '', pendidikan: '', agama: '' },
    view: 'overview',
    table: { page: 0, pageSize: APP_CONFIG.ui.tablePageSize, sortKey: 'nama', sortDir: 1 },
    dir: { shown: APP_CONFIG.ui.directoryPageSize, sort: 'nama' },
};

/* ---------- Query string <-> state ---------- */

function readUrl() {
    const p = new URLSearchParams(location.search);
    for (const k of Object.keys(state.filters)) if (p.has(k)) state.filters[k] = p.get(k);
    if (p.has('view')) state.view = p.get('view');
}

function writeUrl() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state.filters)) if (v) p.set(k, v);
    if (state.view !== 'overview') p.set('view', state.view);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

/* ---------- Seleksi data ---------- */

function selectRecords() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    let rows = state.all.filter((r) =>
        (!f.provinsi || r.provinsi === f.provinsi) &&
        (!f.kabkota || r.kabkota === f.kabkota) &&
        (!f.jabatan || r.jabatan === f.jabatan) &&
        (!f.gender || r.gender === f.gender) &&
        (!f.pendidikan || r.pendidikan === f.pendidikan) &&
        (!f.agama || r.agama === f.agama) &&
        (!q || r._search.includes(q))
    );
    const { sortKey, sortDir } = state.table;
    rows = rows.slice().sort((a, b) => {
        const x = a[sortKey] ?? '', y = b[sortKey] ?? '';
        const nx = Number(x), ny = Number(y);
        if (x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * sortDir;
        return String(x).localeCompare(String(y), 'id') * sortDir;
    });
    return rows;
}

function sortForDirectory(rows) {
    const s = state.dir.sort;
    if (s === 'kelengkapan') return rows.slice().sort((a, b) => b._completeness - a._completeness);
    return rows.slice().sort((a, b) => String(a[s] || '').localeCompare(String(b[s] || ''), 'id'));
}

/* ---------- Render ---------- */

function render() {
    const rows = selectRecords();

    FACETS.forEach(({ id, key, all }) => {
        const values = [...new Set(state.all.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
        UI.fillFacet($('#' + id), values, state.filters[key], all);
    });
    $('#fSearch').value = state.filters.q;

    UI.renderKpis(A.kpis(rows, state.all));

    const prov = A.countBy(rows, 'provinsi');
    $('#hintProv').textContent = prov.labels.length + ' provinsi';
    C.barChart('chProvinsi', prov, { horizontal: prov.labels.length > 7 });

    const kabkota = A.countBy(rows, 'kabkota');
    $('#hintKabkota').textContent = kabkota.labels.length + ' kab/kota';
    C.barChart('chKabkota', kabkota, { horizontal: kabkota.labels.length > 7 });

    C.donutChart('chGender', A.countBy(rows, 'gender'));
    C.donutChart('chPendidikan', A.countBy(rows, 'pendidikan', { sort: 'label' }));
    C.barChart('chJabatan', A.countBy(rows, 'jabatan', { limit: APP_CONFIG.ui.topJabatan }), { horizontal: true, color: C.PALETTE[1] });
    C.barChart('chPenugasan', A.countBy(rows, 'div'), { color: C.PALETTE[4], horizontal: true });
    C.barChart('chAgama', A.countBy(rows, 'agama'), { color: C.PALETTE[2] });
    C.percentBar('chKelengkapan', A.completeness(rows));
    C.stackedBar('chSilang', A.crossTab(rows, 'provinsi', 'pendidikan', { rowLimit: 12 }));

    $('#dirCount').textContent = '(' + rows.length + ' orang)';
    UI.renderDirectory(sortForDirectory(rows), state.dir.shown);
    $('#btnMore').hidden = state.dir.shown >= rows.length;

    const maxPage = Math.max(0, Math.ceil(rows.length / state.table.pageSize) - 1);
    state.table.page = Math.min(state.table.page, maxPage);
    UI.renderTable(rows, state.table);

    UI.renderQuality(state.issues, state.meta);
    writeUrl();
    return rows;
}

function switchView(view) {
    state.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== view; });
    writeUrl();
}

/* ---------- Ekspor ---------- */

function exportCsv(rows) {
    const cell = (v) => {
        const s = String(v ?? '');
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [
        FIELDS.map((f) => cell(f.label)).join(','),
        ...rows.map((r) => FIELDS.map((f) => cell(r[f.key])).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'personel-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    UI.toast('Berhasil mengekspor ' + rows.length + ' baris.', 'success');
}

/* ---------- Event binding ---------- */

function debounce(fn, ms = 200) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function bindEvents() {
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

    $('#fSearch').addEventListener('input', debounce((e) => {
        state.filters.q = e.target.value;
        state.table.page = 0;
        state.dir.shown = APP_CONFIG.ui.directoryPageSize;
        render();
    }, 220));

    FACETS.forEach(({ id, key }) => {
        $('#' + id).addEventListener('change', (e) => {
            state.filters[key] = e.target.value;
            state.table.page = 0;
            render();
        });
    });

    $('#btnReset').addEventListener('click', () => {
        Object.keys(state.filters).forEach((k) => { state.filters[k] = ''; });
        state.table.page = 0;
        render();
        UI.toast('Filter dikosongkan.');
    });

    $('#btnExport').addEventListener('click', () => exportCsv(selectRecords()));
    $('#btnRefresh').addEventListener('click', () => bootstrap({ force: true }));

    $('#grid thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
        const key = th.dataset.key;
        state.table.sortDir = state.table.sortKey === key ? -state.table.sortDir : 1;
        state.table.sortKey = key;
        render();
    });

    $('#prevPage').addEventListener('click', () => { state.table.page -= 1; render(); });
    $('#nextPage').addEventListener('click', () => { state.table.page += 1; render(); });
    $('#pageSize').addEventListener('change', (e) => {
        state.table.pageSize = Number(e.target.value);
        state.table.page = 0;
        render();
    });

    $('#dirSort').addEventListener('change', (e) => { state.dir.sort = e.target.value; render(); });
    $('#btnMore').addEventListener('click', () => {
        state.dir.shown += APP_CONFIG.ui.directoryPageSize;
        render();
    });

    const openFromEvent = (e) => {
        const card = e.target.closest('.person, tr[data-id]');
        if (!card || e.target.closest('a')) return;
        const rec = state.all.find((r) => r._id === card.dataset.id);
        if (rec) UI.openDrawer(rec);
    };
    $('#dirGrid').addEventListener('click', openFromEvent);
    $('#dirGrid').addEventListener('keydown', (e) => { if (e.key === 'Enter') openFromEvent(e); });
    $('#grid tbody').addEventListener('click', openFromEvent);

    $('#drawer').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) UI.closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') UI.closeDrawer(); });
}

/* ---------- Bootstrap ---------- */

async function bootstrap({ force = false } = {}) {
    UI.showState('loading', force ? 'Mengambil versi terbaru berkas data…' : 'Memuat data dari ' + APP_CONFIG.dataSource.url + ' …');
    try {
        const { records, issues, meta, fromCache } = await loadDataset({ force });
        state.all = records;
        state.issues = issues;
        state.meta = meta;

        $('#appName').textContent = APP_CONFIG.appName;
        $('#appOrg').textContent = APP_CONFIG.orgName;
        $('#sourceBadge').textContent = meta.sheetName + ' · ' + meta.rowCount + ' baris' + (fromCache ? ' (cache)' : '');

        UI.showState('hidden');
        $('#filterBar').hidden = false;
        switchView(state.view);
        render();

        if (meta.unmappedColumns > 0) {
            UI.toast(meta.unmappedColumns + ' kolom pada berkas tidak dikenali dan diabaikan.', 'warn');
        }
    } catch (err) {
        const isData = err instanceof DataError;
        UI.showState('error', isData ? err.message : 'Terjadi kesalahan tak terduga.', isData ? err.hint : String(err));
        $('#filterBar').hidden = true;
        console.error(err);
    }
}

function start() {
    if (!window.XLSX || !window.Chart) {
        UI.showState('error', 'Pustaka pihak ketiga gagal dimuat.',
            'Periksa koneksi internet, atau unduh chart.umd.min.js dan xlsx.full.min.js ke folder assets/vendor lalu ubah tautannya di index.html.');
        return;
    }
    C.applyDefaults();
    readUrl();
    bindEvents();
    bootstrap();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
} else {
    start();
}