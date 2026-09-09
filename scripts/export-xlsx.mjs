/**
 * scripts/export-xlsx.mjs
 * 
 * Export dataset dari Supabase Postgres ke file XLSX:
 * 1. Admin dataset: header lengkap sama persis dengan Excel lama + kolom id dan personnel_code.
 * 2. Public dataset: hanya kolom-kolom publik non-PII.
 * 
 * Usage:
 *   node scripts/export-xlsx.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const EXPORT_DIR = path.resolve('data/export');
fs.mkdirSync(EXPORT_DIR, { recursive: true });

async function exportData() {
    console.log('=== EXPORT DATASET DARI SUPABASE ===');

    if (!isDbConfigured()) {
        console.warn('[export] DB belum dikonfigurasi. Mengambil data dari cache/fallback...');
    }

    // 1. Fetch data dari Postgres
    const { data: personnel, error: pError } = await supabaseAdmin
        .from('personnel')
        .select('*')
        .is('deleted_at', null)
        .order('personnel_code', { ascending: true });

    if (pError) {
        console.error('Gagal mengambil data personnel:', pError.message);
        return;
    }

    console.log(`Berhasil mengambil ${personnel?.length || 0} baris personel.`);

    // --- A. EXPORT DATASET ADMIN ---
    // Header sama dengan Excel lama, plus id dan personnel_code
    const adminRows = (personnel || []).map((p) => ({
        'ID': p.id,
        'KODE PERSONEL': p.personnel_code,
        'PROVINSI': p.province || '',
        'KABUPATEN/KOTA': p.district || '',
        'NAMA': p.name || '',
        'JENIS KELAMIN': p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : '',
        'JABATAN': p.position || '',
        'WAKORDIV': p.wakordiv || '',
        'DIVISI': p.division || '',
        'AMJ': p.term_raw || p.term_end || '',
        'AGAMA': p.religion || '',
        'PENDIDIKAN': p.education || '',
        'HP': p.phone || '',
        'EMAIL PRIBADI': p.private_email || '',
        'EMAIL KANTOR': p.office_email || '',
        'ALAMAT': p.office_address || '',
        'FACEBOOK': p.facebook || '',
        'INSTAGRAM': p.instagram || '',
        'WEBSITE': p.website || '',
        'FOTO': p.photo_local_path || '',
    }));

    const adminSheet = XLSX.utils.json_to_sheet(adminRows);
    const adminBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(adminBook, adminSheet, 'DATA_ADMIN');
    
    const adminFilePath = path.join(EXPORT_DIR, 'data-admin-latest.xlsx');
    XLSX.writeFile(adminBook, adminFilePath);
    console.log(`✓ Admin dataset tersimpan: ${adminFilePath}`);

    // --- B. EXPORT DATASET PUBLIK ---
    // Hanya kolom aman publik (tanpa PII sensitif)
    const publicRows = (personnel || []).filter(p => p.is_published).map((p) => ({
        'KODE PERSONEL': p.personnel_code,
        'PROVINSI': p.province || '',
        'KABUPATEN/KOTA': p.district || '',
        'NAMA': p.name || '',
        'JENIS KELAMIN': p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : '',
        'JABATAN': p.position || '',
        'DIVISI': p.division || '',
        'AKHIR MASA JABATAN': p.term_end || '',
        'EMAIL KANTOR': p.office_email || '',
        'WEBSITE': p.website || '',
        'FOTO PUBLIK': p.photo_is_public ? p.photo_object_path || '' : '',
    }));

    const publicSheet = XLSX.utils.json_to_sheet(publicRows);
    const publicBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(publicBook, publicSheet, 'DATA_PUBLIK');
    
    const publicFilePath = path.join(EXPORT_DIR, 'data-publik-latest.xlsx');
    XLSX.writeFile(publicBook, publicFilePath);
    console.log(`✓ Public dataset tersimpan: ${publicFilePath} (${publicRows.length} record dipublikasi)`);
}

exportData().catch(console.error);
