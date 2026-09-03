/** Lapisan visualisasi: satu-satunya tempat yang mengetahui Chart.js. */
const registry = new Map();
let chartLibLoading = null;
let chartLibLoaded = false;

export const PALETTE = [
    '#F58220',
    '#FFB366',
    '#D96A00',
    '#C62828',
    '#F8A145',
    '#FDBA74',
    '#8D6E63',
];

/**
 * Lazy load Chart.js library hanya saat dibutuhkan.
 * Mengembalikan Promise yang resolve saat library siap digunakan.
 */
export async function ensureChartLib() {
    if (chartLibLoaded && window.Chart) return true;
    
    if (chartLibLoading) return chartLibLoading;
    
    chartLibLoading = new Promise((resolve, reject) => {
        // Cek apakah sudah dimuat sebelumnya (dari script tag di HTML)
        if (window.Chart) {
            chartLibLoaded = true;
            console.log('[charts] ✓ Chart.js already loaded');
            resolve(true);
            return;
        }
        
        console.log('[charts] ⏳ Loading Chart.js library...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.integrity = 'sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4';
        script.crossOrigin = 'anonymous';
        script.async = true;
        
        script.onload = () => {
            chartLibLoaded = true;
            console.log('[charts] ✓ Chart.js loaded successfully');
            resolve(true);
        };
        
        script.onerror = () => {
            console.error('[charts] ✗ Failed to load Chart.js');
            reject(new Error('Failed to load Chart.js library'));
        };
        
        document.head.appendChild(script);
    });
    
    return chartLibLoading;
}

export function applyDefaults() {
    // BUG LAMA: tidak ada penjagaan bila CDN Chart.js gagal dimuat -> ReferenceError
    // yang menghentikan seluruh proses render.
    if (typeof window === 'undefined' || !window.Chart) {
        console.warn('[charts] Chart.js tidak termuat; bagian grafik dilewati.');
        return false;
    }
    const { Chart } = window;
    Chart.defaults.font.family = "'Segoe UI', Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#5c6a80';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.animation.duration = 350;
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.maintainAspectRatio = false;
    return true;
}

function upsert(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;

    const existing = registry.get(canvasId);
    if (existing) {
        // BUG LAMA: kanvas yang sudah diganti/dihapus dari DOM tetap tersimpan di
        // registry, sehingga update menulis ke kanvas "hantu" dan memori bocor.
        if (existing.canvas !== canvas || !existing.canvas.isConnected) {
            existing.destroy();
            registry.delete(canvasId);
        } else {
            existing.data = config.data;
            existing.options = config.options;
            existing.update();
            return existing;
        }
    }

    const chart = new window.Chart(canvas, config);
    registry.set(canvasId, chart);
    return chart;
}

export function destroyChart(canvasId) {
    const chart = registry.get(canvasId);
    if (!chart) return;
    chart.destroy();
    registry.delete(canvasId);
}

export function destroyAll() {
    for (const [id, chart] of registry) {
        chart.destroy();
        registry.delete(id);
    }
}

const gridX = { grid: { color: '#FFE6CC' }, ticks: { precision: 0 } };
const noLegend = { legend: { display: false } };

export function barChart(id, { labels, values }, { horizontal = false, color = PALETTE[0], suffix = '' } = {}) {
    upsert(id, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 6, maxBarThickness: 34 }] },
        options: {
            indexAxis: horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                ...noLegend,
                tooltip: { callbacks: { label: (c) => ' ' + (horizontal ? c.parsed.x : c.parsed.y) + suffix } },
            },
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
            datasets: [
                {
                    data: items.map((i) => i.value),
                    backgroundColor: items.map((i) =>
                        i.value >= 80 ? '#F58220' : i.value >= 50 ? '#F7A34B' : '#C62828'
                    ),
                    borderRadius: 6,
                    maxBarThickness: 24,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + '% terisi' } } },
            scales: {
                x: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: '#eef1f6' } },
                y: { grid: { display: false } },
            },
        },
    });
}

export function donutChart(id, { labels, values }) {
    upsert(id, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: PALETTE,
                    borderWidth: 2,
                    borderColor: '#FFF8F1',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                            return ' ' + c.label + ': ' + c.parsed + ' (' + Math.round((c.parsed / total) * 100) + '%)';
                        },
                    },
                },
            },
        },
    });
}

export function stackedBar(id, { rows, series }) {
    upsert(id, {
        type: 'bar',
        data: {
            labels: rows,
            datasets: series.map((s, i) => ({
                label: s.label,
                data: s.data,
                backgroundColor: PALETTE[i % PALETTE.length],
                borderRadius: 4,
                maxBarThickness: 40,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } },
            },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ...gridX },
            },
        },
    });
}
