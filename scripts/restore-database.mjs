/**
 * scripts/restore-database.mjs
 * 
 * Mengimpor data hasil ekspor dari data/latest-db-backup.json ke project Supabase baru.
 * 
 * Usage:
 *   node scripts/restore-database.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const BACKUP_FILE = path.resolve('data/latest-db-backup.json');

async function restoreDatabase() {
    console.log('====================================================');
    console.log('RESTORE DATA LOKAL KE SUPABASE BARU');
    console.log('====================================================');

    if (!isDbConfigured()) {
        console.error('FATAL: Database belum dikonfigurasi di .env.');
        process.exit(1);
    }

    if (!fs.existsSync(BACKUP_FILE)) {
        console.error(`FATAL: File cadangan ${BACKUP_FILE} tidak ditemukan.`);
        console.error('Jalankan "node scripts/export-database.mjs" terlebih dahulu di database lama.');
        process.exit(1);
    }

    const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
    console.log(`Memulihkan cadangan tanggal: ${backup.exported_at}`);
    console.log(`- ${backup.personnel?.length || 0} Personel`);
    console.log(`- ${backup.awards?.length || 0} Penghargaan`);

    // 1. Insert/Upsert Personnel
    if (backup.personnel && backup.personnel.length > 0) {
        console.log('\n[1/2] Mengimpor data personel...');
        for (const p of backup.personnel) {
            const { error: pErr } = await supabaseAdmin
                .from('personnel')
                .upsert({
                    id: p.id,
                    personnel_code: p.personnel_code,
                    province: p.province,
                    district: p.district,
                    name: p.name,
                    gender: p.gender,
                    position: p.position,
                    wakordiv: p.wakordiv,
                    division: p.division,
                    term_start: p.term_start,
                    term_end: p.term_end,
                    term_raw: p.term_raw,
                    religion: p.religion,
                    education: p.education,
                    phone: p.phone,
                    private_email: p.private_email,
                    office_email: p.office_email,
                    office_address: p.office_address,
                    facebook: p.facebook,
                    instagram: p.instagram,
                    website: p.website,
                    photo_local_path: p.photo_local_path,
                    photo_object_path: p.photo_object_path,
                    photo_is_public: p.photo_is_public,
                    is_published: p.is_published,
                    version: p.version,
                }, { onConflict: 'id' });

            if (pErr) {
                console.error(`Gagal mengimpor personel ${p.name}:`, pErr.message);
            }
        }
        console.log('✓ Data personel berhasil diimpor.');
    }

    // 2. Insert/Upsert Awards
    if (backup.awards && backup.awards.length > 0) {
        console.log('\n[2/2] Mengimpor data penghargaan...');
        for (const a of backup.awards) {
            const { error: aErr } = await supabaseAdmin
                .from('awards')
                .upsert({
                    id: a.id,
                    personnel_id: a.personnel_id,
                    title: a.title,
                    category: a.category,
                    issuer: a.issuer,
                    awarded_on: a.awarded_on,
                    proof_local_path: a.proof_local_path,
                    proof_object_path: a.proof_object_path,
                    is_published: a.is_published,
                }, { onConflict: 'id' });

            if (aErr) {
                console.error(`Gagal mengimpor penghargaan ${a.title}:`, aErr.message);
            }
        }
        console.log('✓ Data penghargaan berhasil diimpor.');
    }

    console.log('\n====================================================');
    console.log('RESTORE DATABASE BERHASIL SEPENUHNYA!');
    console.log('====================================================\n');
}

restoreDatabase().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
