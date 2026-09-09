/**
 * scripts/backup-db.mjs
 * 
 * Dump seluruh tabel api.personnel dan api.awards ke JSON + XLSX bertanggal
 * ke folder data/backup/ lokal.
 * 
 * Usage:
 *   node scripts/backup-db.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const BACKUP_DIR = path.resolve('data/backup');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function runBackup() {
    console.log('=== BACKUP DATABASE SUPABASE KE LOKAL ===');

    if (!isDbConfigured()) {
        console.error('FATAL: Database belum dikonfigurasi di .env.');
        process.exit(1);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 1. Backup Personnel
    const { data: personnel, error: pErr } = await supabaseAdmin
        .from('personnel')
        .select('*')
        .order('created_at', { ascending: true });

    if (pErr) throw new Error('Gagal backup personnel: ' + pErr.message);

    // 2. Backup Awards
    const { data: awards, error: aErr } = await supabaseAdmin
        .from('awards')
        .select('*')
        .order('created_at', { ascending: true });

    if (aErr) throw new Error('Gagal backup awards: ' + aErr.message);

    // Save JSON
    const jsonBackup = {
        timestamp: new Date().toISOString(),
        tables: {
            personnel: personnel || [],
            awards: awards || [],
        }
    };
    const jsonPath = path.join(BACKUP_DIR, `db-backup-${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonBackup, null, 2), 'utf-8');
    console.log(`✓ JSON backup tersimpan: ${jsonPath}`);

    // Save XLSX multi-sheet
    const wb = XLSX.utils.book_new();
    const sheetPersonnel = XLSX.utils.json_to_sheet(personnel || []);
    const sheetAwards = XLSX.utils.json_to_sheet(awards || []);
    XLSX.utils.book_append_sheet(wb, sheetPersonnel, 'personnel');
    XLSX.utils.book_append_sheet(wb, sheetAwards, 'awards');

    const xlsxPath = path.join(BACKUP_DIR, `db-backup-${stamp}.xlsx`);
    XLSX.writeFile(wb, xlsxPath);
    console.log(`✓ XLSX backup tersimpan: ${xlsxPath}`);

    console.log(`Backup selesai: ${personnel.length} personnel, ${awards.length} awards.`);
}

runBackup().catch((err) => {
    console.error('Backup gagal:', err.message);
});
