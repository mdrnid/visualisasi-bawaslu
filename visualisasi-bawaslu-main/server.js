import express from 'express';
import * as XLSX from 'xlsx';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 8080;
const HOST = '0.0.0.0';

function getNetworkIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const [name, ifaces] of Object.entries(interfaces)) {
        // Lewati adapter virtual seperti VirtualBox, WSL, vEthernet, dsb.
        const isVirtual = /virtual|vbox|wsl|vethernet|loopback/i.test(name);
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ name, address: iface.address, isVirtual });
            }
        }
    }
    // Urutkan yang non-virtual / Wi-Fi di atas
    ips.sort((a, b) => (a.isVirtual === b.isVirtual ? 0 : a.isVirtual ? 1 : -1));
    return ips;
}

app.use(express.json({ limit: '10mb' }));

// ==========================================
// LANDING PAGE
// Saat membuka http://localhost:8080
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});

// ==========================================
// FILE STATIS
// ==========================================
app.use(express.static(__dirname, {
    index: false
}));

// ==========================================
// API SIMPAN DATA KE EXCEL
// ==========================================
app.post('/api/save', (req, res) => {
    try {
        const rows = req.body;

        if (!Array.isArray(rows)) {
            return res.status(400).json({
                error: 'Data harus berupa array.'
            });
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            wb,
            ws,
            'Data Personel'
        );

        const filePath = path.join(
            __dirname,
            'data',
            'data.xlsx'
        );

        XLSX.writeFile(wb, filePath);

        res.json({
            success: true,
            message: 'Berhasil menyimpan data ke Excel.'
        });

    } catch (err) {
        console.error('Error saving data:', err);

        res.status(500).json({
            error: 'Gagal menyimpan data.'
        });
    }
});

// ==========================================
// JALANKAN SERVER
// ==========================================
app.listen(port, HOST, () => {
    const ips = getNetworkIps();
    console.log('\n========================================');
    console.log(`  App berjalan dan dapat diakses di:`);
    console.log(`  - Local:   http://localhost:${port}`);
    ips.forEach(ip => {
        console.log(`  - ${ip.name}: http://${ip.address}:${port}`);
    });
    console.log('========================================\n');
});