/** Lapisan visualisasi: satu-satunya tempat yang mengetahui Chart.js. */
const registry = new Map();

export const PALETTE = ['#1d4ed8', '#0ea5e9', '#0f9d58', '#e8a33d', '#7c3aed',
    '#ef4444', '#14b8a6', '#db2777', '#64748b', '#84cc16', '#f97316', '#4f46e5'];

export function applyDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Segoe UI', Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#5c6a80';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.animation.duration = 350;
}

function upsert(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const existing = registry.get(canvasId);
    if (existing) {
        existing.data = config.data;
        existing.options = config.options;
        existing.update();
        return;
    }
    registry.set(canvasId, new Chart(el, config));
}

const gridX = { grid: { color: '#eef1f6' }, ticks: { precision: 0 } };
const noLegend = { legend: { display: false } };

export function barChart(id, { labels, values }, { horizontal = false, color = PALETTE[0], suffix = '' } = {}) {
    upsert(id, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 6, maxBarThickness: 34 }] },
        options: {
            indexAxis: horizontal ? 'y' : 'x',
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: (c) => ' ' + (horizontal ? c.parsed.x : c.parsed.y) + suffix } } },
            scales: horizontal
                ? { x: { beginAtZero: true, ...gridX }, y: { grid: { display: false } } }
                : { y: { beginAtZero: true, ...gridX }, x: { grid: { display: false } } },
        },
    });
}

export function percentBar(id, items) {
    upsert(id, {
        type: 'bar',
        data: {
            labels: items.map((i) => i.label),
            datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((i) => (i.value >= 80 ? '#0f9d58' : i.value >= 50 ? '#e8a33d' : '#ef4444')), borderRadius: 6 }],
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + '% terisi' } } },
            scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: '#eef1f6' } }, y: { grid: { display: false } } },
        },
    });
}

export function donutChart(id, { labels, values }) {
    upsert(id, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '58%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                            return ' ' + c.label + ': ' + c.parsed + ' (' + Math.round((c.parsed / total) * 100) + '%)';
                        }
                    }
                },
            },
        },
    });
}

export function stackedBar(id, { rows, series }) {
    upsert(id, {
        type: 'bar',
        data: { labels: rows, datasets: series.map((s, i) => ({ label: s.label, data: s.data, backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 4 })) },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ...gridX } },
        },
    });
}

export function destroyAll() {
    registry.forEach((c) => c.destroy());
    registry.clear();
}