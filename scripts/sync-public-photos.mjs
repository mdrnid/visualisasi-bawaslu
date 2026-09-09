/**
 * scripts/sync-public-photos.mjs
 * 
 * Sinkronisasi foto profil publik ke Supabase Storage (bucket public-photos).
 * Aturan:
 * 1. Hanya mengunggah salinan foto bila: is_published = true DAN photo_is_public = true.
 * 2. Simpan ke path: personnel/<uuid>/profile.<ext>.
 * 3. HAPUS objek di bucket dan kosongkan photo_object_path bila is_published / photo_is_public = false atau soft-deleted.
 * 4. Berkas asli di disk lokal TIDAK disentuh/diubah.
 * 
 * Usage:
 *   node scripts/sync-public-photos.mjs            (--dry-run default)
 *   node scripts/sync-public-photos.mjs --commit   (eksekusi ke Storage & DB)
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const isCommit = process.argv.includes('--commit');
const BUCKET_NAME = 'public-photos';
const REPORT_FILE = path.resolve('reports/orphan-assets.md');

async function syncPublicPhotos() {
    console.log('====================================================');
    console.log(`SINKRONISASI FOTO PUBLIK KE STORAGE (${isCommit ? 'COMMIT' : 'DRY-RUN'})`);
    console.log('====================================================');

    if (!isDbConfigured()) {
        console.error('FATAL: Database belum dikonfigurasi di .env.');
        process.exit(1);
    }

    // 1. Ambil semua personnel dari Postgres (termasuk yang soft-deleted untuk cleanup)
    const { data: allPersonnel, error } = await supabaseAdmin
        .from('personnel')
        .select('id, name, photo_local_path, photo_object_path, photo_is_public, is_published, deleted_at');

    if (error) {
        console.error('Gagal mengambil data personnel:', error.message);
        return;
    }

    console.log(`Menganalisis ${allPersonnel.length} record personel...`);

    const toUpload = [];
    const toDelete = [];
    const orphanAssets = [];

    for (const p of allPersonnel) {
        const shouldBePublic = Boolean(p.is_published && p.photo_is_public && !p.deleted_at);

        if (shouldBePublic) {
            // Harus ada di storage
            if (p.photo_local_path) {
                const localPath = path.resolve(p.photo_local_path);
                if (fs.existsSync(localPath)) {
                    const ext = path.extname(localPath).toLowerCase() || '.webp';
                    const targetObjectPath = `personnel/${p.id}/profile${ext}`;
                    
                    if (p.photo_object_path !== targetObjectPath) {
                        toUpload.push({
                            id: p.id,
                            name: p.name,
                            localPath,
                            targetObjectPath,
                            contentType: ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg',
                        });
                    }
                } else {
                    orphanAssets.push({
                        id: p.id,
                        name: p.name,
                        expectedLocalPath: p.photo_local_path,
                        reason: 'Berkas fisik foto tidak ditemukan di disk lokal.',
                    });
                }
            } else {
                orphanAssets.push({
                    id: p.id,
                    name: p.name,
                    reason: 'Record ditandai public tetapi kolom photo_local_path kosong.',
                });
            }
        } else {
            // Tidak boleh ada di storage (tarik dari publikasi / soft deleted)
            if (p.photo_object_path) {
                toDelete.push({
                    id: p.id,
                    name: p.name,
                    objectPath: p.photo_object_path,
                });
            }
        }
    }

    console.log(`\nTemuan Sinkronisasi:`);
    console.log(`- Foto yang perlu diunggah : ${toUpload.length}`);
    console.log(`- Foto yang perlu dihapus  : ${toDelete.length}`);
    console.log(`- Foto bermasalah/orphan   : ${orphanAssets.length}`);

    if (isCommit) {
        // Eksekusi Upload
        for (const item of toUpload) {
            console.log(`Mengunggah: ${item.name} -> ${item.targetObjectPath}`);
            const fileBuffer = fs.readFileSync(item.localPath);
            const { error: upErr } = await supabaseAdmin.storage
                .from(BUCKET_NAME)
                .upload(item.targetObjectPath, fileBuffer, {
                    contentType: item.contentType,
                    upsert: true,
                });

            if (upErr) {
                console.error(`Gagal unggah foto ${item.name}:`, upErr.message);
            } else {
                await supabaseAdmin
                    .from('personnel')
                    .update({ photo_object_path: item.targetObjectPath })
                    .eq('id', item.id);
            }
        }

        // Eksekusi Delete
        for (const item of toDelete) {
            console.log(`Menghapus dari publikasi: ${item.name} (${item.objectPath})`);
            const { error: delErr } = await supabaseAdmin.storage
                .from(BUCKET_NAME)
                .remove([item.objectPath]);

            if (delErr) {
                console.warn(`Gagal hapus objek di bucket:`, delErr.message);
            }

            await supabaseAdmin
                .from('personnel')
                .update({ photo_object_path: null })
                .eq('id', item.id);
        }
    } else {
        console.log('\n[DRY-RUN] Tidak ada perubahan ke Storage. Jalankan dengan --commit untuk menerapkan.');
    }

    // Catat orphan assets ke reports
    const reportMd = `# Laporan Aset Foto Bermasalah / Orphan (Storage Sync)

Tanggal Audit: ${new Date().toISOString()}

## Daftar Catatan:
${orphanAssets.length === 0 ? '- Tidak ada aset bermasalah.' : orphanAssets.map((o, idx) => `${idx + 1}. **${o.name}** (ID: \`${o.id}\`): ${o.reason} ${o.expectedLocalPath ? `(\`${o.expectedLocalPath}\`)` : ''}`).join('\n')}
`;

    fs.writeFileSync(REPORT_FILE, reportMd, 'utf-8');
    console.log(`\nLaporan aset tersimpan di: ${REPORT_FILE}`);
}

syncPublicPhotos().catch(console.error);
