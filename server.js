import express from 'express';
import * as XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 8080;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.post('/api/save', (req, res) => {
    try {
        const rows = req.body;
        if (!Array.isArray(rows)) {
            return res.status(400).json({ error: 'Data harus berupa array.' });
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data Personel");
        
        const filePath = path.join(__dirname, 'data', 'data.xlsx');
        XLSX.writeFile(wb, filePath);

        res.json({ success: true, message: 'Berhasil menyimpan data ke Excel.' });
    } catch (err) {
        console.error('Error saving data:', err);
        res.status(500).json({ error: 'Gagal menyimpan data.' });
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
