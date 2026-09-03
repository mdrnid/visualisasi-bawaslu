#!/usr/bin/env node
/**
 * Reconcile Assets: Audit foto & penghargaan vs data Excel
 * 
 * Skrip ini:
 * 1. Membaca data.xlsx untuk mendapatkan daftar personel + ID
 * 2. Scan assets/personel/*.webp dan cocokkan dengan nama
 * 3. Scan assets/awards/*/ dan cocokkan dengan kabkota+nama
 * 4. Generate slug-map.json (slug lama → ID baru)
 * 5. Laporkan orphan (aset tanpa personel) dan missing (personel tanpa aset)
 * 
 * TIDAK menghapus file apa pun, hanya laporan audit.
 */

import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.xlsx');
const PHOTO_DIR = path.join(__dirname, '..', 'assets', 'personel');
const AWARDS_DIR = path.join(__dirname, '..', 'assets', 'awards');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'migrations', 'slug-map.json');

function slugify(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function main() {
    console.log('[reconcile] Memulai audit aset...\n');
    
    // 1. Baca data Excel
    if (!fs.existsSync(DATA_FILE)) {
        console.error('[reconcile] ❌ File data.xlsx tidak ditemukan!');
        process.exit(1);
    }
    
    console.log('[reconcile] Membaca data.xlsx...');
    const workbook = XLSX.readFile(DATA_FILE);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    console.log(`[reconcile] ✓ Terbaca ${data.length} personel\n`);
    
    // 2. Build mapping: slug → ID, nama → ID
    const slugToId = new Map();
    const nameToId = new Map();
    
    data.forEach((row) => {
        const id = row.ID || row.id || '';
        const nama = String(row.NAMA || row.nama || '').trim();
        const kabkota = String(row['KABUPATEN/KOTA'] || row.kabkota || '').trim();
        
        if (!id || !nama) return;
        
        // Slug foto: slugify(nama)
        const photoSlug = slugify(nama);
        if (photoSlug) {
            slugToId.set(photoSlug + '.webp', id);
        }
        
        // Slug awards: slugify(kabkota)/slugify(nama)
        if (kabkota) {
            const awardPath = slugify(kabkota) + '/' + slugify(nama);
            slugToId.set(awardPath, id);
        }
        
        // Mapping nama → ID untuk lookup
        nameToId.set(nama.toLowerCase(), id);
    });
    
    console.log(`[reconcile] ✓ Built mapping untuk ${slugToId.size} slug\n`);
    
    // 3. Scan foto
    console.log('[reconcile] === AUDIT FOTO ===');
    const photos = fs.existsSync(PHOTO_DIR) ? fs.readdirSync(PHOTO_DIR).filter(f => f.endsWith('.webp')) : [];
    const photoMap = {};
    const photoOrphans = [];
    
    photos.forEach((file) => {
        if (slugToId.has(file)) {
            photoMap[file] = slugToId.get(file);
        } else {
            photoOrphans.push(file);
        }
    });
    
    console.log(`✓ ${Object.keys(photoMap).length} foto berhasil dicocokkan dengan personel`);
    
    if (photoOrphans.length > 0) {
        console.log(`⚠ ${photoOrphans.length} foto ORPHAN (tidak cocok dengan personel):`);
        photoOrphans.slice(0, 10).forEach(f => console.log(`  - ${f}`));
        if (photoOrphans.length > 10) {
            console.log(`  ... dan ${photoOrphans.length - 10} lainnya`);
        }
    }
    
    // Cek personel tanpa foto
    const personelWithPhoto = new Set(Object.values(photoMap));
    const missingPhotos = data.filter(r => {
        const id = r.ID || r.id;
        return id && !personelWithPhoto.has(id) && r.NAMA;
    });
    
    if (missingPhotos.length > 0) {
        console.log(`\n⚠ ${missingPhotos.length} personel TANPA FOTO:`);
        missingPhotos.slice(0, 10).forEach(r => {
            const id = r.ID || r.id;
            const nama = r.NAMA || r.nama;
            console.log(`  - ${id}: ${nama}`);
        });
        if (missingPhotos.length > 10) {
            console.log(`  ... dan ${missingPhotos.length - 10} lainnya`);
        }
    }
    
    console.log('');
    
    // 4. Scan folder penghargaan
    console.log('[reconcile] === AUDIT PENGHARGAAN ===');
    const awardsMap = {};
    const awardsOrphans = [];
    
    if (fs.existsSync(AWARDS_DIR)) {
        const kabFolders = fs.readdirSync(AWARDS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());
        
        kabFolders.forEach((kabDir) => {
            const kabPath = path.join(AWARDS_DIR, kabDir.name);
            const personFolders = fs.readdirSync(kabPath, { withFileTypes: true })
                .filter(d => d.isDirectory());
            
            personFolders.forEach((personDir) => {
                const awardPath = kabDir.name + '/' + personDir.name;
                
                if (slugToId.has(awardPath)) {
                    awardsMap[awardPath] = slugToId.get(awardPath);
                } else {
                    awardsOrphans.push(awardPath);
                }
            });
        });
        
        console.log(`✓ ${Object.keys(awardsMap).length} folder penghargaan berhasil dicocokkan`);
        
        if (awardsOrphans.length > 0) {
            console.log(`⚠ ${awardsOrphans.length} folder ORPHAN (tidak cocok dengan personel):`);
            awardsOrphans.slice(0, 10).forEach(p => console.log(`  - assets/awards/${p}/`));
            if (awardsOrphans.length > 10) {
                console.log(`  ... dan ${awardsOrphans.length - 10} lainnya`);
            }
        }
    } else {
        console.log('⚠ Direktori assets/awards tidak ditemukan');
    }
    
    console.log('');
    
    // 5. Generate slug-map.json
    console.log('[reconcile] Menyimpan slug-map.json...');
    
    const slugMap = {
        _generated: new Date().toISOString(),
        _description: 'Mapping slug lama → ID baru untuk backward compatibility',
        photos: photoMap,
        awards: awardsMap,
        orphans: {
            photos: photoOrphans,
            awards: awardsOrphans
        }
    };
    
    const outputDir = path.dirname(OUTPUT_FILE);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(slugMap, null, 2));
    
    console.log(`✓ Slug map disimpan: ${OUTPUT_FILE}`);
    console.log('');
    
    // 6. Ringkasan
    console.log('[reconcile] === RINGKASAN ===');
    console.log(`Total personel: ${data.length}`);
    console.log(`Foto tersedia: ${photos.length} (${Object.keys(photoMap).length} cocok, ${photoOrphans.length} orphan)`);
    console.log(`Folder awards: ${Object.keys(awardsMap).length} (${awardsOrphans.length} orphan)`);
    console.log(`Personel tanpa foto: ${missingPhotos.length}`);
    console.log('');
    console.log('[reconcile] ✅ Audit selesai!');
    console.log('');
    console.log('Catatan:');
    console.log('- Orphan tidak dihapus otomatis (butuh review manual)');
    console.log('- Untuk migrate slug → ID, implementasikan fallback di photos.js & awards.js');
}

main();
