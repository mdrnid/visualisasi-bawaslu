/** Lapisan presentasi: render DOM. Tidak mengambil data dan tidak menyimpan state. */
import { FIELDS, FIELD_BY_KEY } from './schema.js';
import { APP_CONFIG } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const waLink = (hp) => (hp ? 'https://wa.me/' + hp : '');
export const igLink = (h) => (h ? 'https://instagram.com/' + h : '');
export const fbLink = (h) => (h ? 'https://facebook.com/' + h : '');

export function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function toast(message, tone = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast toast--' + tone;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 4000);
}

export function showState(kind, title, detail = '') {
    const box = $('#stateBox');
    if (kind === 'hidden') { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'state state--' + kind;
    box.innerHTML = kind === 'loading'
        ? '<div class="spinner"></div><p>' + esc(title) + '</p>'
        : '<div class="state__icon">' + (kind === 'error' ? '⚠️' : '📄') + '</div>' +
        '<h2>' + esc(title) + '</h2>' + (detail ? '<p>' + esc(detail) + '</p>' : '');
}

export function renderKpis(items) {
    $('#kpiGrid').innerHTML = items.map((k) =>
        '<article class="kpi"><p class="kpi__label">' + esc(k.label) + '</p>' +
        '<p class="kpi__value">' + esc(k.value) + '</p>' +
        '<p class="kpi__hint">' + esc(k.hint) + '</p></article>').join('');
}

export function fillFacet(selectEl, values, current, allLabel) {
    selectEl.innerHTML = '<option value="">' + esc(allLabel) + '</option>' +
        values.map((v) => '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
}

/* ---------- Direktori ---------- */

function contactLinks(r) {
    const out = [];
    if (r.hp) out.push('<a class="chip chip--wa" href="' + waLink(r.hp) + '" target="_blank" rel="noopener">WhatsApp</a>');
    if (r.emailK) out.push('<a class="chip" href="mailto:' + esc(r.emailK) + '">E-mail Kantor</a>');
    if (r.emailP) out.push('<a class="chip" href="mailto:' + esc(r.emailP) + '">E-mail Pribadi</a>');
    if (r.instagram) out.push('<a class="chip" href="' + esc(igLink(r.instagram)) + '" target="_blank" rel="noopener">Instagram</a>');
    if (r.facebook) out.push('<a class="chip" href="' + esc(fbLink(r.facebook)) + '" target="_blank" rel="noopener">Facebook</a>');
    if (r.website) out.push('<a class="chip" href="' + esc(r.website) + '" target="_blank" rel="noopener">Website</a>');
    return out.join('');
}

export function renderDirectory(records, shown) {
    const grid = $('#dirGrid');
    if (!records.length) {
        grid.innerHTML = '<p class="empty">Tidak ada personel yang cocok dengan filter saat ini.</p>';
        return;
    }
    grid.innerHTML = records.slice(0, shown).map((r) => {
        const tone = r._completeness >= 80 ? 'good' : r._completeness >= 40 ? 'mid' : 'low';
        const meta = [r.provinsi, r.pendidikan, r.gender].filter(Boolean)
            .map((t) => '<span class="tag">' + esc(t) + '</span>').join('');
        return '<article class="person" data-id="' + esc(r._id) + '" tabindex="0" role="button">' +
            '<header class="person__head">' +
            '<div class="avatar">' + esc(initials(r.nama)) + '</div>' +
            '<div class="person__id">' +
            '<h3>' + esc(r.nama || '(Tanpa nama)') + '</h3>' +
            '<p>' + esc(r.jabatan || 'Jabatan belum tercatat') + '</p>' +
            '</div>' +
            '<span class="score score--' + tone + '" title="Kelengkapan data">' + r._completeness + '%</span>' +
            '</header>' +
            '<div class="tags">' + meta + '</div>' +
            (r.alamat ? '<p class="person__addr">' + esc(r.alamat) + '</p>' : '') +
            '<div class="chips">' + contactLinks(r) + '</div>' +
            '</article>';
    }).join('');
}

export function openDrawer(record) {
    const rows = FIELDS.filter((f) => record[f.key]).map((f) => {
        let value = esc(record[f.key]);
        if (f.key === 'hp') value = '<a href="' + waLink(record.hp) + '" target="_blank" rel="noopener">+' + esc(record.hp) + '</a>';
        if (f.type === 'email') value = '<a href="mailto:' + esc(record[f.key]) + '">' + esc(record[f.key]) + '</a>';
        if (f.key === 'website') value = '<a href="' + esc(record.website) + '" target="_blank" rel="noopener">' + esc(record.website) + '</a>';
        if (f.key === 'instagram') value = '<a href="' + esc(igLink(record.instagram)) + '" target="_blank" rel="noopener">@' + esc(record.instagram) + '</a>';
        if (f.key === 'facebook') value = '<a href="' + esc(fbLink(record.facebook)) + '" target="_blank" rel="noopener">' + esc(record.facebook) + '</a>';
        return '<div class="dl__row"><dt>' + esc(f.label) + '</dt><dd>' + value + '</dd></div>';
    }).join('');

    $('#drawerTitle').textContent = record.nama || '(Tanpa nama)';
    $('#drawerBody').innerHTML =
        '<div class="drawer__hero"><div class="avatar avatar--lg">' + esc(initials(record.nama)) + '</div>' +
        '<div><p class="drawer__role">' + esc(record.jabatan || '—') + '</p>' +
        '<p class="muted">Baris sumber #' + record._rowNumber + ' · kelengkapan ' + record._completeness + '%</p></div></div>' +
        '<dl class="dl">' + rows + '</dl>';
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
}

/* ---------- Tabel ---------- */

export function renderTable(records, { page, pageSize, sortKey, sortDir }) {
    const thead = $('#grid thead');
    const tbody = $('#grid tbody');
    const start = page * pageSize;
    const slice = records.slice(start, start + pageSize);

    thead.innerHTML = '<tr>' + FIELDS.map((f) =>
        '<th data-key="' + f.key + '" aria-sort="' + (sortKey === f.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
        esc(f.label) + (sortKey === f.key ? (sortDir === 1 ? ' ↑' : ' ↓') : '') + '</th>').join('') + '</tr>';

    tbody.innerHTML = slice.length
        ? slice.map((r) => '<tr data-id="' + esc(r._id) + '">' + FIELDS.map((f) => {
            const v = r[f.key];
            if (!v) return '<td class="na">—</td>';
            if (f.key === 'hp') return '<td><a href="' + waLink(v) + '" target="_blank" rel="noopener">+' + esc(v) + '</a></td>';
            if (f.type === 'email') return '<td><a href="mailto:' + esc(v) + '">' + esc(v) + '</a></td>';
            if (f.key === 'website') return '<td><a href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(v) + '</a></td>';
            return '<td>' + esc(v) + '</td>';
        }).join('') + '</tr>').join('')
        : '<tr><td class="empty" colspan="' + FIELDS.length + '">Tidak ada baris yang cocok.</td></tr>';

    const from = records.length ? start + 1 : 0;
    const to = Math.min(start + pageSize, records.length);
    $('#pagerInfo').textContent = 'Menampilkan ' + from + '–' + to + ' dari ' +
        records.length.toLocaleString(APP_CONFIG.ui.locale) + ' baris';
    $('#prevPage').disabled = page === 0;
    $('#nextPage').disabled = to >= records.length;
}

/* ---------- Kualitas data ---------- */

export function renderQuality(issues, meta) {
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.length - errors;

    $('#qualitySummary').innerHTML =
        '<div class="quality-grid">' +
        '<div><p class="kpi__label">Baris terbaca</p><p class="kpi__value">' + meta.rowCount + '</p></div>' +
        '<div><p class="kpi__label">Kolom dikenali</p><p class="kpi__value">' + meta.recognized + '/' + meta.totalColumns + '</p></div>' +
        '<div><p class="kpi__label">Kesalahan</p><p class="kpi__value tone-bad">' + errors + '</p></div>' +
        '<div><p class="kpi__label">Peringatan</p><p class="kpi__value tone-warn">' + warnings + '</p></div>' +
        '</div>' +
        '<p class="muted">Sheet <code>' + esc(meta.sheetName) + '</code> · header pada baris ' + (meta.headerIndex + 1) +
        (meta.lastModified ? ' · berkas diperbarui ' + esc(meta.lastModified) : '') + '</p>';

    $('#issueTable thead').innerHTML =
        '<tr><th>Baris</th><th>Nama</th><th>Tingkat</th><th>Kolom</th><th>Keterangan</th></tr>';
    $('#issueTable tbody').innerHTML = issues.length
        ? issues.map((i) =>
            '<tr><td>' + i.rowNumber + '</td><td>' + esc(i.nama) + '</td>' +
            '<td><span class="sev sev--' + i.severity + '">' + (i.severity === 'error' ? 'Kesalahan' : 'Peringatan') + '</span></td>' +
            '<td>' + esc(i.field) + '</td><td>' + esc(i.message) + '</td></tr>').join('')
        : '<tr><td class="empty" colspan="5">Tidak ada temuan. Data bersih. ✅</td></tr>';

    const badge = $('#qualityBadge');
    badge.hidden = issues.length === 0;
    badge.textContent = issues.length;
    badge.className = 'badge' + (errors ? ' badge--bad' : ' badge--warn');
}