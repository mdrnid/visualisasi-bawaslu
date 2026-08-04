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
    all: [],
    issues: [],
    meta: null,
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

let _lastFilterKey = '',
    _lastResult = [];
function selectRecords() {
    const f = state.filters;
    const { sortKey, sortDir } = state.table;
    const key = JSON.stringify(f) + '|' + sortKey + '|' + sortDir + '|' + state.all.length;
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

/* ---------- Render ---------- */

function render() {
    const rows = selectRecords();

    FACETS.forEach(({ id, key, all }) => {
        const values = [...new Set(state.all.map((r) => r[key]).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'id')
        );
        UI.fillFacet($('#' + id), values, state.filters[key], all);
    });
    $('#fSearch').value = state.filters.q;

    if (state.view === 'overview') {
        UI.renderKpis(A.kpis(rows, state.all));

        const prov = A.countBy(rows, 'provinsi');
        $('#hintProv').textContent = prov.labels.length + ' provinsi';
        C.barChart('chProvinsi', prov, { horizontal: prov.labels.length > 7 });

        const kabkota = A.countBy(rows, 'kabkota');
        $('#hintKabkota').textContent = kabkota.labels.length + ' kab/kota';
        C.barChart('chKabkota', kabkota, { horizontal: kabkota.labels.length > 7 });

        C.donutChart('chGender', A.countBy(rows, 'gender'));
        C.donutChart('chPendidikan', A.countBy(rows, 'pendidikan', { sort: 'label' }));
        C.barChart('chJabatan', A.countBy(rows, 'jabatan', { limit: APP_CONFIG.ui.topJabatan }), {
            horizontal: true,
            color: C.PALETTE[1],
        });
        C.barChart('chPenugasan', A.countBy(rows, 'div'), { color: C.PALETTE[4], horizontal: true });
        C.barChart('chAgama', A.countBy(rows, 'agama'), { color: C.PALETTE[2] });
        C.percentBar('chKelengkapan', A.completeness(rows));
        C.stackedBar('chSilang', A.crossTab(rows, 'provinsi', 'pendidikan', { rowLimit: 12 }));
    } else if (state.view === 'directory') {
        $('#dirCount').textContent = '(' + rows.length + ' orang)';
        UI.renderDirectory(sortForDirectory(rows), state.dir.shown);
        $('#btnMore').hidden = state.dir.shown >= rows.length;
    } else if (state.view === 'table') {
        const maxPage = Math.max(0, Math.ceil(rows.length / state.table.pageSize) - 1);
        state.table.page = Math.min(state.table.page, maxPage);
        UI.renderTable(rows, state.table);
    } else if (state.view === 'quality') {
        UI.renderQuality(state.issues, state.meta);
    }

    // Update tab visual status for accessibility
    $$('.tab').forEach((t) => {
        const isCurrent = t.dataset.view === state.view;
        t.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    writeUrl();
    return rows;
}

function switchView(view) {
    state.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    $$('.view').forEach((s) => {
        s.hidden = s.dataset.view !== view;
    });
    render();
}

/* ---------- Ekspor ---------- */

function exportExcel(rows) {
    if (!window.XLSX) {
        UI.toast('Pustaka XLSX belum dimuat.', 'error');
        return;
    }
    const data = rows.map((r) => {
        const obj = {};
        FIELDS.forEach((f) => {
            obj[f.label] = r[f.key] ?? '';
        });
        return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Personel");
    XLSX.writeFile(wb, 'personel-' + new Date().toISOString().slice(0, 10) + '.xlsx');
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
function openModal(id = null) {
    const form = $('#dataForm');
    form.reset();
    $('#formRowId').value = '';
    $('#modalTitle').textContent = id ? 'Edit Data' : 'Tambah Data';

    if (id) {
        const rec = state.all.find(r => r._id === id);
        if (rec) {
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
        }
    }
    $('#modalForm').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    $('#modalForm').hidden = true;
    document.body.style.overflow = '';
}

function saveData() {
    const id = $('#formRowId').value;
    const newData = {
        nama: $('#iNama').value,
        provinsi: $('#iProvinsi').value,
        kabkota: $('#iKabkota').value,
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
        _search: [$('#iNama').value, $('#iJabatan').value, $('#iProvinsi').value, $('#iKabkota').value].join(' ').toLowerCase()
    };

    if (id) {
        const index = state.all.findIndex(r => r._id === id);
        if (index !== -1) {
            state.all[index] = { ...state.all[index], ...newData };
        }
        UI.toast('Data berhasil diperbarui.', 'success');
    } else {
        const newId = 'row-new-' + Date.now();
        const newRecord = { 
            _id: newId, 
            _rowNumber: state.all.length ? Math.max(...state.all.map(r => r._rowNumber)) + 1 : 1,
            _completeness: 80,
            ...newData 
        };
        state.all.unshift(newRecord);
        UI.toast('Data baru berhasil ditambahkan.', 'success');
    }

    closeModal();
    render();
    syncToServer();
}

async function syncToServer() {
    try {
        const rows = state.all.map((r) => {
            const obj = {};
            FIELDS.forEach((f) => {
                obj[f.label] = r[f.key] ?? '';
            });
            return obj;
        });
        
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows)
        });
        const resData = await response.json();
        
        if (!response.ok) {
            UI.toast('Gagal menyimpan ke file Excel: ' + (resData.error || 'Unknown error'), 'warn');
        } else {
            UI.toast('Tersimpan permanen ke Excel.', 'success');
        }
    } catch (e) {
        console.error(e);
        UI.toast('Kesalahan koneksi saat menyimpan.', 'warn');
    }
}

function bindEvents() {
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

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
    $('#btnRefresh').addEventListener('click', () => bootstrap({ force: true }));

    $('#grid thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
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

    $('#dirSort').addEventListener('change', (e) => {
        state.dir.sort = e.target.value;
        render();
    });
    $('#btnMore').addEventListener('click', () => {
        state.dir.shown += APP_CONFIG.ui.directoryPageSize;
        render();
    });

    const openFromEvent = (e) => {
        const card = e.target.closest('.person, tr[data-id]');
        if (!card || e.target.closest('a') || e.target.closest('.chk-col') || e.target.closest('input[type="checkbox"]')) return;
        const rec = state.all.find((r) => r._id === card.dataset.id);
        if (rec) UI.openDrawer(rec);
    };
    $('#dirGrid').addEventListener('click', openFromEvent);
    $('#dirGrid').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openFromEvent(e);
    });
    $('#grid tbody').addEventListener('click', openFromEvent);

    $('#drawer').addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close')) UI.closeDrawer();
        
        // Listener untuk tombol Edit di dalam drawer
        const btnEdit = e.target.closest('#btnEditData');
        if (btnEdit) {
            UI.closeDrawer();
            openModal(btnEdit.dataset.id);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            UI.closeDrawer();
            closeModal();
        }
    });

    $('#modalForm')?.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close-modal')) closeModal();
    });

    $('#dataForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveData();
    });

    // Event listener untuk Tambah Data dan Hapus Data
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
        
        // Uncheck all when canceling
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
        if (confirm('Yakin ingin menghapus ' + checked.length + ' data terpilih?')) {
            const idsToDelete = new Set(checked.map(c => c.value));
            state.all = state.all.filter(r => !idsToDelete.has(r._id));
            state.table.page = 0;
            
            // Exit delete mode
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

/* ---------- Bootstrap ---------- */

async function bootstrap({ force = false } = {}) {
    UI.showState(
        'loading',
        force ? 'Mengambil versi terbaru berkas data…' : 'Memuat data dari ' + APP_CONFIG.dataSource.url + ' …'
    );
    try {
        const { records, issues, meta, fromCache } = await loadDataset({ force });
        state.all = records;
        state.issues = issues;
        state.meta = meta;

        $('#appName').textContent = APP_CONFIG.appName;
        $('#appOrg').textContent = APP_CONFIG.orgName;
        $('#sourceBadge').textContent =
            meta.sheetName + ' · ' + meta.rowCount + ' baris' + (fromCache ? ' (cache)' : '');

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
        UI.showState(
            'error',
            'Pustaka pihak ketiga gagal dimuat.',
            'Periksa koneksi internet, atau unduh chart.umd.min.js dan xlsx.full.min.js ke folder assets/vendor lalu ubah tautannya di index.html.'
        );
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
