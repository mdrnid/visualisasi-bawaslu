/** Konfigurasi Aplikasi */
export const APP_CONFIG = {
    appName: 'Direktori Personel',
    orgName: 'Bawaslu',
    
    dataSource: {
        url: 'data/data.xlsx', // <-- Sudah disesuaikan ke data/data.xlsx
        sheet: 0,
        headerScanRows: 12
    },
    
    cache: {
        enabled: true,
        key: 'bawaslu-personel-cache-v3',
        ttlMinutes: 15
    },
    
    ui: {
        defaultCountryCode: '62',
        locale: 'id-ID',
        tablePageSize: 50,
        directoryPageSize: 24,
        topJabatan: 12
    }
};
