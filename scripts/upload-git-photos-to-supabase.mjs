/**
 * scripts/upload-git-photos-to-supabase.mjs
 * 
 * Mengekstrak seluruh foto personel dari riwayat git commit 2996e7d
 * dan mengunggahnya langsung ke Supabase Storage (bucket public-photos).
 * 
 * Memperbarui tabel api.personnel:
 * - photo_object_path = 'personnel/<id>/profile.webp'
 * - photo_is_public = true
 * - is_published = true
 */
import child_process from 'node:child_process';
import path from 'node:path';
import { supabaseAdmin, isDbConfigured } from '../lib/db.js';

const BUCKET_NAME = 'public-photos';
const GIT_COMMIT = '2996e7d';

function slugify(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function stripTitles(name) {
    if (!name) return '';
    return name
        .replace(/,\s*([A-Za-z.\s]+)$/i, '')
        .replace(/^(dr|dra|drs|h|hj|prof)\.?\s+/i, '')
        .trim();
}

async function run() {
    if (!isDbConfigured()) {
        console.error('FATAL: Database belum dikonfigurasi di .env.');
        process.exit(1);
    }

    console.log(`[1] Membaca daftar berkas foto dari git commit ${GIT_COMMIT}...`);
    const gitOutput = child_process.execSync(`git ls-tree -r --name-only ${GIT_COMMIT} assets/personel`, { encoding: 'utf8' });
    const gitFiles = gitOutput.split('\n').map(s => s.trim()).filter(Boolean);
    const gitWebpFiles = gitFiles.filter(f => f.endsWith('.webp') && !f.includes('/_originals/'));
    console.log(`Ditemukan ${gitWebpFiles.length} berkas webp di git.`);

    // Mapping git filename -> git path
    const gitMap = new Map();
    for (const f of gitWebpFiles) {
        const basename = path.basename(f);
        gitMap.set(basename, f);
        gitMap.set(f, f);
    }

    console.log(`[2] Membaca data personel dari database...`);
    const { data: personnelList, error } = await supabaseAdmin
        .from('personnel')
        .select('id, name, district, photo_local_path, photo_object_path, photo_is_public, is_published')
        .is('deleted_at', null);

    if (error) {
        console.error('Gagal membaca personnel:', error);
        process.exit(1);
    }

    console.log(`Total personel aktif: ${personnelList.length}`);

    let uploadedCount = 0;
    let updatedDbCount = 0;
    let notFoundCount = 0;

    for (const p of personnelList) {
        let matchedGitPath = null;

        // Coba match langsung dari photo_local_path
        if (p.photo_local_path) {
            const base = path.basename(p.photo_local_path.replace(/\\/g, '/'));
            if (gitMap.has(base)) {
                matchedGitPath = gitMap.get(base);
            }
        }

        // Jika belum ketemu, coba match berdasarkan slug nama
        if (!matchedGitPath) {
            const slugFull = slugify(p.name) + '.webp';
            const slugBare = slugify(stripTitles(p.name)) + '.webp';

            if (gitMap.has(slugFull)) {
                matchedGitPath = gitMap.get(slugFull);
            } else if (gitMap.has(slugBare)) {
                matchedGitPath = gitMap.get(slugBare);
            } else {
                // Kasus khusus
                if (p.name.toLowerCase().includes('aris')) {
                    matchedGitPath = gitMap.get('muhammad-aris.webp');
                } else if (p.name.toLowerCase().includes('jalil')) {
                    matchedGitPath = gitMap.get('abd-jalil-s-pd-m-pd.webp');
                }
            }
        }

        if (!matchedGitPath) {
            notFoundCount++;
            continue;
        }

        // Ekstrak buffer dari git
        const fileBuffer = child_process.execFileSync('git', ['show', `${GIT_COMMIT}:${matchedGitPath}`]);
        const targetObjectPath = `personnel/${p.id}/profile.webp`;
        const legacySlugPath = `personnel/${path.basename(matchedGitPath)}`;

        // Unggah ke Supabase Storage (UUID profile path)
        const { error: upErr1 } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(targetObjectPath, fileBuffer, {
                contentType: 'image/webp',
                upsert: true,
            });

        if (upErr1) {
            console.error(`Gagal unggah ${targetObjectPath}:`, upErr1.message);
            continue;
        }

        // Unggah juga legacy slug path agar backwards compatible
        await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(legacySlugPath, fileBuffer, {
                contentType: 'image/webp',
                upsert: true,
            });

        uploadedCount++;

        // Update database
        const { error: dbErr } = await supabaseAdmin
            .from('personnel')
            .update({
                photo_object_path: targetObjectPath,
                photo_is_public: true,
                is_published: true,
            })
            .eq('id', p.id);

        if (dbErr) {
            console.error(`Gagal update DB untuk ${p.name}:`, dbErr.message);
        } else {
            updatedDbCount++;
            console.log(`[OK] ${p.name} -> ${targetObjectPath}`);
        }
    }

    console.log('\n=========================================');
    console.log(`Foto berhasil diunggah : ${uploadedCount}`);
    console.log(`Database terupdate     : ${updatedDbCount}`);
    console.log(`Personel tanpa foto    : ${notFoundCount}`);
    console.log('=========================================');
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
