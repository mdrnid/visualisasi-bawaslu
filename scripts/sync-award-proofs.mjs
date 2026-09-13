/**
 * scripts/sync-award-proofs.mjs
 * 
 * Sinkronisasi berkas fisik bukti penghargaan (PDF/gambar) dari direktori
 * lokal assets/awards/ ke Supabase Storage bucket 'award-proofs'.
 * 
 * Penggunaan:
 *   node scripts/sync-award-proofs.mjs            # Dry-run (hanya melihat)
 *   node scripts/sync-award-proofs.mjs --commit   # Unggah berkas & update DB
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';
import { compressProofBuffer } from '../utils/compressor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AWARDS_DIR = path.join(ROOT_DIR, 'assets', 'awards');
const BUCKET_NAME = 'award-proofs';

const isCommit = process.argv.includes('--commit');

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.pdf': return 'application/pdf';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
}

function walkDir(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
        } else {
            const ext = path.extname(file).toLowerCase();
            if (['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

async function main() {
    console.log('====================================================');
    console.log(`SINKRONISASI BUKTI PENGHARGAAN -> SUPABASE STORAGE`);
    console.log(`Mode: ${isCommit ? 'COMMIT (Unggah Nyata)' : 'DRY-RUN (Simulasi)'}`);
    console.log('====================================================\n');

    if (!isDbConfigured()) {
        console.error('FATAL: Database/Supabase credentials belum dikonfigurasi.');
        process.exit(1);
    }

    // 1. Pastikan bucket award-proofs ada dan berstatus publik
    const { data: bucket, error: bErr } = await supabaseAdmin.storage.getBucket(BUCKET_NAME);
    if (bErr || !bucket) {
        console.log(`Membuat bucket '${BUCKET_NAME}'...`);
        if (isCommit) {
            const { error: cErr } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: 25 * 1024 * 1024,
            });
            if (cErr) {
                console.error(`Gagal membuat bucket '${BUCKET_NAME}':`, cErr.message);
                process.exit(1);
            }
        }
    } else if (!bucket.public && isCommit) {
        console.log(`Mengubah bucket '${BUCKET_NAME}' menjadi publik...`);
        await supabaseAdmin.storage.updateBucket(BUCKET_NAME, { public: true });
    }

    // 2. Ambil seluruh data awards dari database
    const { data: dbAwards, error: aErr } = await supabaseAdmin
        .from('awards')
        .select('id, title, proof_local_path, proof_object_path, personnel:personnel_id(name, district)');

    if (aErr) {
        console.error('Gagal mengambil data awards dari DB:', aErr.message);
        process.exit(1);
    }

    console.log(`Ditemukan ${dbAwards?.length || 0} data penghargaan di database.\n`);

    // 3. Pindai berkas fisik di assets/awards/
    const files = walkDir(AWARDS_DIR);
    console.log(`Ditemukan ${files.length} berkas fisik di assets/awards/.\n`);

    let uploadedCount = 0;
    let matchedCount = 0;

    for (const filePath of files) {
        const relativeLocalPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        // Buat object path yang rapi di bucket: hilangkan prefix assets/awards/
        const objectPath = path.relative(AWARDS_DIR, filePath).replace(/\\/g, '/');
        const mimeType = getMimeType(filePath);

        // Cari row penghargaan yang cocok
        const matchingAwards = (dbAwards || []).filter(a => {
            if (!a.proof_local_path) return false;
            const normDb = a.proof_local_path.replace(/\\/g, '/').toLowerCase();
            const normLocal = relativeLocalPath.toLowerCase();
            return normDb === normLocal || normDb.endsWith(objectPath.toLowerCase());
        });

        console.log(`[FILE] ${relativeLocalPath}`);
        console.log(`  -> Object Path : ${objectPath}`);
        console.log(`  -> Terkait ke  : ${matchingAwards.length} baris award`);

        if (isCommit) {
            const rawBuffer = fs.readFileSync(filePath);
            const buffer = await compressProofBuffer(rawBuffer, filePath);
            const { error: upErr } = await supabaseAdmin.storage
                .from(BUCKET_NAME)
                .upload(objectPath, buffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (upErr) {
                console.error(`  ✗ Gagal upload ke Supabase Storage:`, upErr.message);
                continue;
            }
            uploadedCount++;

            // Update database awards dengan proof_object_path
            for (const ma of matchingAwards) {
                const { error: uErr } = await supabaseAdmin
                    .from('awards')
                    .update({
                        proof_object_path: objectPath,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', ma.id);

                if (uErr) {
                    console.error(`  ✗ Gagal update DB award ${ma.id}:`, uErr.message);
                } else {
                    matchedCount++;
                    console.log(`  ✓ Berhasil update DB untuk: "${ma.title}"`);
                }
            }
        }
        console.log('');
    }

    console.log('====================================================');
    console.log('RINGKASAN SINKRONISASI:');
    console.log(`- Berkas diproses       : ${files.length}`);
    if (isCommit) {
        console.log(`- Berhasil diunggah     : ${uploadedCount}`);
        console.log(`- Baris award diperbarui: ${matchedCount}`);
        console.log('STATUS: Selesai diunggah ke Supabase Storage!');
    } else {
        console.log('STATUS: Dry-run selesai. Jalankan dengan --commit untuk mengunggah.');
    }
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
