/**
 * scripts/export-database.mjs
 * 
 * Mengekspor seluruh data aktif terkini dari Supabase (personnel, awards)
 * ke berkas JSON lokal (data/latest-db-backup.json).
 * Berguna saat ingin backup atau migrasi ke akun Supabase baru tanpa kehilangan data editan terbaru.
 * 
 * Usage:
 *   node scripts/export-database.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const BACKUP_FILE = path.resolve('data/latest-db-backup.json');

async function exportDatabase() {
    console.log('====================================================');
    console.log('EKSPOR DATA LIVE DARI SUPABASE KE BERKAS LOKAL');
    console.log('====================================================');

    if (!isDbConfigured()) {
        console.error('FATAL: Database belum dikonfigurasi di .env.');
        process.exit(1);
    }

    // 1. Ambil seluruh personel aktif
    const { data: personnel, error: pErr } = await supabaseAdmin
        .from('personnel')
        .select('*')
        .is('deleted_at', null)
        .order('personnel_code', { ascending: true });

    if (pErr) {
        console.error('Gagal membaca tabel personnel:', pErr.message);
        process.exit(1);
    }

    // 2. Ambil seluruh penghargaan
    const { data: awards, error: aErr } = await supabaseAdmin
        .from('awards')
        .select('*')
        .order('created_at', { ascending: true });

    if (aErr) {
        console.error('Gagal membaca tabel awards:', aErr.message);
        process.exit(1);
    }

    const payload = {
        exported_at: new Date().toISOString(),
        counts: {
            personnel: personnel.length,
            awards: awards.length,
        },
        personnel,
        awards,
    };

    fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2), 'utf-8');

    console.log(`\nBerhasil mengekspor:`);
    console.log(`- ${personnel.length} data Personel`);
    console.log(`- ${awards.length} data Penghargaan`);
    console.log(`Tersimpan di: ${BACKUP_FILE}\n`);
}

exportDatabase().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
