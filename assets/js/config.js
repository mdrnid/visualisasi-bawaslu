/** Konfigurasi Aplikasi */
export const APP_CONFIG = {
    appName: 'Direktori Personel',
    orgName: 'Bawaslu',

    dataSource: {
        url: 'data/data.xlsx', // <-- Sudah disesuaikan ke data/data.xlsx
        sheet: 0,
        headerScanRows: 12,
    },

    cache: {
        enabled: true,
        key: 'bawaslu-personel-cache-v4',
        ttlMinutes: 1, // FIX A8: 15 menit terlalu lama → data basi. 1 menit cukup untuk mengurangi load.
    },

    ui: {
        defaultCountryCode: '62',
        locale: 'id-ID',
        tablePageSize: 50,
        directoryPageSize: 24,
        topJabatan: 12,
    },
};
