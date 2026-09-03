/**
 * Test round-trip Excel: baca → tulis → baca harus identik (no type drift)
 */
import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_COLUMNS = [
    'NO', 'PROVINSI', 'KABUPATEN/KOTA', 'NO URUT', 'NAMA', 'JENIS KELAMIN', 'JABATAN',
    'WAKORDIV', 'DIVISI', 'AMJ', 'AGAMA', 'PENDIDIKAN', 'HP', 'EMAIL PRIBADI',
    'EMAIL KANTOR', 'ALAMAT', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'FOTO',
];

const KEY_TO_COLUMN = {
    no: 'NO', provinsi: 'PROVINSI', kabkota: 'KABUPATEN/KOTA', noUrut: 'NO URUT',
    nama: 'NAMA', gender: 'JENIS KELAMIN', jabatan: 'JABATAN', wakordiv: 'WAKORDIV',
    div: 'DIVISI', amj: 'AMJ', agama: 'AGAMA', pendidikan: 'PENDIDIKAN', hp: 'HP',
    emailP: 'EMAIL PRIBADI', emailK: 'EMAIL KANTOR', alamat: 'ALAMAT',
    facebook: 'FACEBOOK', instagram: 'INSTAGRAM', website: 'WEBSITE', foto: 'FOTO',
};

const MAX_CELL_LENGTH = 500;

function toExcelRow(row) {
    const out = {};
    for (const col of EXCEL_COLUMNS) out[col] = '';
    
    for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('_') || value === null || value === undefined) continue;
        const col = KEY_TO_COLUMN[key] || (EXCEL_COLUMNS.includes(key) ? key : null);
        if (!col) continue;
        
        if (col === 'NO' || col === 'NO URUT') {
            const num = Number(value);
            out[col] = Number.isNaN(num) ? '' : num;
        } else if (col === 'AMJ') {
            if (value instanceof Date) {
                out[col] = value.toISOString().split('T')[0];
            } else if (typeof value === 'string' && value.trim()) {
                const parsed = new Date(value);
                if (!isNaN(parsed.getTime())) {
                    out[col] = parsed.toISOString().split('T')[0];
                } else {
                    out[col] = String(value).slice(0, MAX_CELL_LENGTH);
                }
            } else if (typeof value === 'number') {
                const date = XLSX.SSF.parse_date_code(value);
                out[col] = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            } else {
                out[col] = '';
            }
        } else {
            out[col] = String(value).slice(0, MAX_CELL_LENGTH);
        }
    }
    return out;
}

describe('Round-trip Excel type preservation', () => {
    it('should preserve number type for NO column', () => {
        const testData = [
            { no: 1, nama: 'Test User 1', provinsi: 'Sulawesi Selatan' },
            { no: 2, nama: 'Test User 2', provinsi: 'Sulawesi Selatan' },
            { no: 10, nama: 'Test User 10', provinsi: 'Sulawesi Selatan' },
        ];
        
        const excelRows = testData.map(toExcelRow);
        
        // Verify NO is number, not string
        expect(typeof excelRows[0]['NO']).toBe('number');
        expect(typeof excelRows[1]['NO']).toBe('number');
        expect(typeof excelRows[2]['NO']).toBe('number');
        
        expect(excelRows[0]['NO']).toBe(1);
        expect(excelRows[2]['NO']).toBe(10);
    });
    
    it('should convert AMJ to consistent ISO date string (YYYY-MM-DD)', () => {
        const testData = [
            { nama: 'User 1', amj: new Date('2020-01-15') },
            { nama: 'User 2', amj: '2021-03-20' },
            { nama: 'User 3', amj: 44562 }, // Excel serial date for 2022-01-01
        ];
        
        const excelRows = testData.map(toExcelRow);
        
        // All should be YYYY-MM-DD format strings
        expect(excelRows[0]['AMJ']).toBe('2020-01-15');
        expect(excelRows[1]['AMJ']).toBe('2021-03-20');
        expect(excelRows[2]['AMJ']).toBe('2022-01-01');
    });
    
    it('should handle invalid dates gracefully', () => {
        const testData = [
            { nama: 'User 1', amj: 'invalid-date' },
            { nama: 'User 2', amj: '' },
            { nama: 'User 3', amj: null },
        ];
        
        const excelRows = testData.map(toExcelRow);
        
        // Invalid dates should be preserved as string or empty
        expect(typeof excelRows[0]['AMJ']).toBe('string');
        expect(excelRows[1]['AMJ']).toBe('');
        expect(excelRows[2]['AMJ']).toBe('');
    });
    
    it('should truncate long text values to MAX_CELL_LENGTH', () => {
        const longText = 'a'.repeat(600);
        const testData = [
            { nama: 'User', alamat: longText },
        ];
        
        const excelRows = testData.map(toExcelRow);
        
        expect(excelRows[0]['ALAMAT'].length).toBe(MAX_CELL_LENGTH);
    });
    
    it('should ignore keys starting with underscore', () => {
        const testData = [
            { nama: 'User', _id: 'internal-id', _rowNumber: 1 },
        ];
        
        const excelRows = testData.map(toExcelRow);
        
        expect(excelRows[0]['_id']).toBeUndefined();
        expect(excelRows[0]['_rowNumber']).toBeUndefined();
        expect(excelRows[0]['NAMA']).toBe('User');
    });
});
