/** Fungsi agregasi murni — tanpa DOM, mudah diuji unit. */
import { COMPLETENESS_KEYS, FIELD_BY_KEY } from './schema.js';

export function countBy(records, key, { limit = 0, sort = 'desc' } = {}) {
    const map = new Map();
    for (const r of records) {
        const v = r[key];
        if (!v) continue;
        map.set(v, (map.get(v) || 0) + 1);
    }
    let entries = [...map.entries()];
    entries.sort(sort === 'label'
        ? (a, b) => a[0].localeCompare(b[0], 'id')
        : (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'id'));
    if (limit > 0 && entries.length > limit) {
        const head = entries.slice(0, limit);
        const rest = entries.slice(limit).reduce((s, e) => s + e[1], 0);
        if (rest) head.push(['Lainnya', rest]);
        entries = head;
    }
    return { labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}

export function completeness(records) {
    const total = records.length || 1;
    return COMPLETENESS_KEYS.map((k) => ({
        label: FIELD_BY_KEY[k].label,
        value: Math.round((records.filter((r) => r[k]).length / total) * 100),
    }));
}



/** Tabulasi silang untuk grafik bertumpuk. */
export function crossTab(records, rowKey, colKey, { rowLimit = 10 } = {}) {
    const rowTotals = countBy(records, rowKey);
    const rows = rowTotals.labels.slice(0, rowLimit);
    const cols = [...new Set(records.map((r) => r[colKey]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
    const series = cols.map((c) => ({
        label: c,
        data: rows.map((rv) => records.filter((r) => r[rowKey] === rv && r[colKey] === c).length),
    }));
    return { rows, series };
}

export function kpis(records, allRecords) {
    const total = records.length;
    const male = records.filter((r) => r.gender === 'Laki-laki').length;
    const female = records.filter((r) => r.gender === 'Perempuan').length;
    const provinsi = new Set(records.map((r) => r.provinsi).filter(Boolean)).size;
    const pasca = records.filter((r) => r.pendidikan === 'S2' || r.pendidikan === 'S3').length;
    const avgComplete = total
        ? Math.round(records.reduce((s, r) => s + r._completeness, 0) / total)
        : 0;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

    return [
        { label: 'Total Personel', value: total, hint: 'dari ' + allRecords.length + ' baris sumber' },
        { label: 'Cakupan Provinsi', value: provinsi, hint: 'wilayah unik' },
        { label: 'Laki-laki', value: male, hint: pct(male) + '% dari tampilan' },
        { label: 'Perempuan', value: female, hint: pct(female) + '% dari tampilan' },
        { label: 'Pascasarjana', value: pasca, hint: pct(pasca) + '% berpendidikan S2/S3' },
        { label: 'Kelengkapan Profil', value: avgComplete + '%', hint: 'rata-rata atribut kontak terisi' },
    ];
}