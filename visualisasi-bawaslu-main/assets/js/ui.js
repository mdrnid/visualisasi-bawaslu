import { FIELDS } from './schema.js';
import { APP_CONFIG } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
    return String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}

export const waLink = (hp) => {
    const clean = String(hp ?? '').replace(/[^0-9]/g, '');
    return clean ? 'https://wa.me/' + clean : '';
};
export const igLink = (h) => {
    const clean = String(h ?? '').replace(/[^a-zA-Z0-9_.]/g, '');
    return clean ? 'https://instagram.com/' + clean : '';
};
export const fbLink = (h) => {
    const clean = String(h ?? '').replace(/[^a-zA-Z0-9_.]/g, '');
    return clean ? 'https://facebook.com/' + clean : '';
};

export function safeHref(url) {
    if (!url) return '#';
    if (/^(https?:|mailto:)/i.test(url)) {
        return esc(url);
    }
    return '#';
}

export function initials(name) {
    const parts = String(name || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function toast(message, tone = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast toast--' + tone;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
        el.hidden = true;
    }, 4000);
}

export function showState(kind, title, detail = '') {
    const box = $('#stateBox');
    if (kind === 'hidden') {
        box.hidden = true;
        return;
    }
    box.hidden = false;
    box.className = 'state state--' + kind;
    box.innerHTML =
        kind === 'loading'
            ? '<div class="spinner"></div><p>' + esc(title) + '</p>'
            : '<div class="state__icon">' +
              (kind === 'error' ? '⚠️' : '📄') +
              '</div>' +
              '<h2>' +
              esc(title) +
              '</h2>' +
              (detail ? '<p>' + esc(detail) + '</p>' : '');
}

export function renderKpis(items) {
    $('#kpiGrid').innerHTML = items
        .map(
            (k) =>
                '<article class="kpi"><p class="kpi__label">' +
                esc(k.label) +
                '</p>' +
                '<p class="kpi__value">' +
                esc(k.value) +
                '</p>' +
                '<p class="kpi__hint">' +
                esc(k.hint) +
                '</p></article>'
        )
        .join('');
}

export function fillFacet(selectEl, values, current, allLabel) {
    selectEl.innerHTML =
        '<option value="">' +
        esc(allLabel) +
        '</option>' +
        values
            .map(
                (v) =>
                    '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'
            )
            .join('');
}

/* ---------- Direktori ---------- */

function contactLinks(r) {
    const out = [];
    if (r.hp)
        out.push(
            '<a class="chip chip--wa" href="' + safeHref(waLink(r.hp)) + '" target="_blank" rel="noopener">WhatsApp</a>'
        );
    if (r.emailK) out.push('<a class="chip" href="' + safeHref('mailto:' + r.emailK) + '">E-mail Kantor</a>');
    if (r.emailP) out.push('<a class="chip" href="' + safeHref('mailto:' + r.emailP) + '">E-mail Pribadi</a>');
    if (r.instagram)
        out.push(
            '<a class="chip" href="' + safeHref(igLink(r.instagram)) + '" target="_blank" rel="noopener">Instagram</a>'
        );
    if (r.facebook)
        out.push(
            '<a class="chip" href="' + safeHref(fbLink(r.facebook)) + '" target="_blank" rel="noopener">Facebook</a>'
        );
    if (r.website)
        out.push('<a class="chip" href="' + safeHref(r.website) + '" target="_blank" rel="noopener">Website</a>');
    return out.join('');
}

export function renderDirectory(records, shown) {
    const grid = $('#dirGrid');
    if (!records.length) {
        grid.innerHTML = '<p class="empty">Tidak ada personel yang cocok dengan filter saat ini.</p>';
        return;
    }
    grid.innerHTML = records
        .slice(0, shown)
        .map((r) => {
            const tone = r._completeness >= 80 ? 'good' : r._completeness >= 40 ? 'mid' : 'low';
            const meta = [r.provinsi, r.pendidikan, r.gender]
                .filter(Boolean)
                .map((t) => '<span class="tag">' + esc(t) + '</span>')
                .join('');
            return (
                '<article class="person" data-id="' +
                esc(r._id) +
                '" tabindex="0" role="button">' +
                '<header class="person__head">' +
                '<div class="avatar">' +
                esc(initials(r.nama)) +
                '</div>' +
                '<div class="person__id">' +
                '<h3>' +
                esc(r.nama || '(Tanpa nama)') +
                '</h3>' +
                '<p>' +
                esc(r.jabatan || 'Jabatan belum tercatat') +
                '</p>' +
                '</div>' +
                '<span class="score score--' +
                tone +
                '" title="Kelengkapan data">' +
                r._completeness +
                '%</span>' +
                '</header>' +
                '<div class="tags">' +
                meta +
                '</div>' +
                (r.alamat ? '<p class="person__addr">' + esc(r.alamat) + '</p>' : '') +
                '<div class="chips">' +
                contactLinks(r) +
                '</div>' +
                '</article>'
            );
        })
        .join('');
}

export function openDrawer(record) {
    const rows = FIELDS.filter((f) => record[f.key])
        .map((f) => {
            let value = esc(record[f.key]);
            if (f.key === 'hp')
                value =
                    '<a href="' +
                    safeHref(waLink(record.hp)) +
                    '" target="_blank" rel="noopener">+' +
                    esc(record.hp) +
                    '</a>';
            if (f.type === 'email')
                value = '<a href="' + safeHref('mailto:' + record[f.key]) + '">' + esc(record[f.key]) + '</a>';
            if (f.key === 'website')
                value =
                    '<a href="' +
                    safeHref(record.website) +
                    '" target="_blank" rel="noopener">' +
                    esc(record.website) +
                    '</a>';
            if (f.key === 'instagram')
                value =
                    '<a href="' +
                    safeHref(igLink(record.instagram)) +
                    '" target="_blank" rel="noopener">@' +
                    esc(record.instagram) +
                    '</a>';
            if (f.key === 'facebook')
                value =
                    '<a href="' +
                    safeHref(fbLink(record.facebook)) +
                    '" target="_blank" rel="noopener">' +
                    esc(record.facebook) +
                    '</a>';
            return '<div class="dl__row"><dt>' + esc(f.label) + '</dt><dd>' + value + '</dd></div>';
        })
        .join('');

    $('#drawerTitle').textContent = record.nama || '(Tanpa nama)';
    $('#drawerBody').innerHTML =
        '<div class="drawer__hero"><div class="avatar avatar--lg">' +
        esc(initials(record.nama)) +
        '</div>' +
        '<div><p class="drawer__role">' +
        esc(record.jabatan || '—') +
        '</p>' +
        '<p class="muted">Baris sumber #' +
        record._rowNumber +
        ' · kelengkapan ' +
        record._completeness +
        '%</p></div></div>' +
        '<dl class="dl">' +
        rows +
        '</dl>' +
        '<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">' +
        '<button class="btn btn--primary" id="btnEditData" type="button" data-id="' + esc(record._id) + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
        'Edit Data</button>' +
        '</div>';
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';

    // Focus trap
    const focusable = $$('a, button, input, select, [tabindex]', $('#drawer .drawer__panel'));
    if (focusable.length) {
        focusable[0].focus();
        $('#drawer')._trap = (e) => {
            if (e.key !== 'Tab') return;
            const first = focusable[0],
                last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        $('#drawer').addEventListener('keydown', $('#drawer')._trap);
    }
}

export function closeDrawer() {
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
    if ($('#drawer')._trap) {
        $('#drawer').removeEventListener('keydown', $('#drawer')._trap);
        delete $('#drawer')._trap;
    }
}

/* ---------- Tabel ---------- */

export function renderTable(records, { page, pageSize, sortKey, sortDir }) {
    const thead = $('#grid thead');
    const tbody = $('#grid tbody');
    const start = page * pageSize;
    const slice = records.slice(start, start + pageSize);

    thead.innerHTML =
        '<tr>' +
        '<th class="chk-col" style="width: 40px; text-align: center;"><input type="checkbox" id="chkAll" title="Pilih Semua"></th>' +
        FIELDS.map((f) => {
            const isSorted = sortKey === f.key;
            const sortClass = isSorted ? 'class="th-sorted"' : '';
            const sortIcon = isSorted
                ? sortDir === 1
                    ? ' <span class="sort-icon">↑</span>'
                    : ' <span class="sort-icon">↓</span>'
                : '';
            return (
                '<th data-key="' +
                f.key +
                '" ' +
                sortClass +
                ' aria-sort="' +
                (isSorted ? (sortDir === 1 ? 'ascending' : 'descending') : 'none') +
                '">' +
                esc(f.label) +
                sortIcon +
                '</th>'
            );
        }).join('') +
        '</tr>';

    tbody.innerHTML = slice.length
        ? slice
              .map(
                  (r) =>
                      '<tr data-id="' +
                      esc(r._id) +
                      '">' +
                      '<td class="chk-col" style="text-align: center;" onclick="event.stopPropagation()"><input type="checkbox" class="chk-row" value="' + esc(r._id) + '"></td>' +
                      FIELDS.map((f) => {
                          const v = r[f.key];
                          const isSorted = sortKey === f.key;
                          const tdClass =
                              (isSorted ? 'td-sorted' : '') +
                              (f.key === 'no' || f.key === 'noUrut' ? ' text-center font-mono' : '');
                          const classAttr = tdClass ? ' class="' + tdClass.trim() + '"' : '';

                          if (!v) return '<td class="na-cell' + (isSorted ? ' td-sorted' : '') + '">—</td>';
                          if (f.key === 'hp') {
                              return (
                                  '<td' +
                                  classAttr +
                                  '><a class="wa-chip" href="' +
                                  safeHref(waLink(v)) +
                                  '" target="_blank" rel="noopener">' +
                                  '<svg class="wa-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.713-1.458L0 24zm6.208-3.79c1.658.984 3.28 1.487 4.965 1.488 5.605 0 10.165-4.561 10.168-10.168.002-2.716-1.053-5.27-2.969-7.189C16.513 2.433 13.96 1.378 11.24 1.378c-5.61 0-10.167 4.56-10.17 10.169-.001 1.905.5 3.766 1.452 5.419L1.523 21.5l4.742-1.29zM17.51 14.86c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.669.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.568-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' +
                                  '<span>+' +
                                  esc(v) +
                                  '</span></a></td>'
                              );
                          }
                          if (f.type === 'email') {
                              return (
                                  '<td' +
                                  classAttr +
                                  '><a class="email-link" href="' +
                                  safeHref('mailto:' + v) +
                                  '">' +
                                  '<svg class="email-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>' +
                                  '<span>' +
                                  esc(v) +
                                  '</span></a></td>'
                              );
                          }
                          if (f.key === 'website') {
                              return (
                                  '<td' +
                                  classAttr +
                                  '><a class="web-link" href="' +
                                  safeHref(v) +
                                  '" target="_blank" rel="noopener">' +
                                  '<svg class="web-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' +
                                  '<span>' +
                                  esc(v) +
                                  '</span></a></td>'
                              );
                          }
                          if (f.key === 'gender') {
                              const cls = v === 'Laki-laki' ? 'badge-gender--male' : 'badge-gender--female';
                              return (
                                  '<td' +
                                  classAttr +
                                  '><span class="badge-gender ' +
                                  cls +
                                  '">' +
                                  esc(v) +
                                  '</span></td>'
                              );
                          }
                          if (f.key === 'pendidikan') {
                              const edu = v.toLowerCase();
                              const cls = ['s1', 's2', 's3'].includes(edu)
                                  ? 'badge-edu--high'
                                  : edu === 'slta'
                                    ? 'badge-edu--mid'
                                    : 'badge-edu--other';
                              return (
                                  '<td' + classAttr + '><span class="badge-edu ' + cls + '">' + esc(v) + '</span></td>'
                              );
                          }
                          return '<td' + classAttr + '>' + esc(v) + '</td>';
                      }).join('') +
                      '</tr>'
              )
              .join('')
        : '<tr><td class="empty" colspan="' + (FIELDS.length + 1) + '">Tidak ada baris yang cocok.</td></tr>';

    const from = records.length ? start + 1 : 0;
    const to = Math.min(start + pageSize, records.length);
    $('#pagerInfo').textContent =
        'Menampilkan ' + from + '–' + to + ' dari ' + records.length.toLocaleString(APP_CONFIG.ui.locale) + ' baris';
    $('#prevPage').disabled = page === 0;
    $('#nextPage').disabled = to >= records.length;
}

/* ---------- Kualitas data ---------- */

export function renderQuality(issues, meta) {
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.length - errors;

    $('#qualitySummary').innerHTML =
        '<div class="quality-grid">' +
        '<div><p class="kpi__label">Baris terbaca</p><p class="kpi__value">' +
        meta.rowCount +
        '</p></div>' +
        '<div><p class="kpi__label">Kolom dikenali</p><p class="kpi__value">' +
        meta.recognized +
        '/' +
        meta.totalColumns +
        '</p></div>' +
        '<div><p class="kpi__label">Kesalahan</p><p class="kpi__value tone-bad">' +
        errors +
        '</p></div>' +
        '<div><p class="kpi__label">Peringatan</p><p class="kpi__value tone-warn">' +
        warnings +
        '</p></div>' +
        '</div>' +
        '<p class="muted">Sheet <code>' +
        esc(meta.sheetName) +
        '</code> · header pada baris ' +
        (meta.headerIndex + 1) +
        (meta.lastModified ? ' · berkas diperbarui ' + esc(meta.lastModified) : '') +
        '</p>';

    $('#issueTable thead').innerHTML =
        '<tr><th>Baris</th><th>Nama</th><th>Tingkat</th><th>Kolom</th><th>Keterangan</th></tr>';
    $('#issueTable tbody').innerHTML = issues.length
        ? issues
              .map(
                  (i) =>
                      '<tr><td>' +
                      i.rowNumber +
                      '</td><td>' +
                      esc(i.nama) +
                      '</td>' +
                      '<td><span class="sev sev--' +
                      i.severity +
                      '">' +
                      (i.severity === 'error' ? 'Kesalahan' : 'Peringatan') +
                      '</span></td>' +
                      '<td>' +
                      esc(i.field) +
                      '</td><td>' +
                      esc(i.message) +
                      '</td></tr>'
              )
              .join('')
        : '<tr><td class="empty" colspan="5">Tidak ada temuan. Data bersih. ✅</td></tr>';

    const badge = $('#qualityBadge');
    badge.hidden = issues.length === 0;
    badge.textContent = issues.length;
    badge.className = 'badge' + (errors ? ' badge--bad' : ' badge--warn');
}
