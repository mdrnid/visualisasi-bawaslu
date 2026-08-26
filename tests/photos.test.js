import { beforeEach, describe, expect, it } from 'vitest';
import { clearPhotoCache, photoCandidates, resolvePhotoUrl } from '../assets/js/photos.js';
import { initials, slugify, stripNameTitles } from '../assets/js/text-utils.js';

beforeEach(() => clearPhotoCache());

describe('text-utils', () => {
    it('membuang gelar depan maupun belakang', () => {
        expect(stripNameTitles('NINGSIH PURWANTI, S.H.')).toBe('ningsih purwanti');
        expect(stripNameTitles('H. Ningsih Purwanti SH')).toBe('ningsih purwanti');
        expect(stripNameTitles('Dr. Andi Baso, M.Si')).toBe('andi baso');
    });

    it('membuat slug tanpa diakritik', () => {
        expect(slugify('Muh. Alï  Akbar')).toBe('muh-ali-akbar');
    });

    it('inisial konsisten: nama depan + nama belakang', () => {
        expect(initials('Muhammad Yusuf Kalla')).toBe('MK');
        expect(initials('H. Ningsih Purwanti, S.H.')).toBe('NP');
        expect(initials('')).toBe('?');
    });
});

describe('photoCandidates', () => {
    it('dua ejaan gelar menghasilkan kandidat yang sama', () => {
        const a = photoCandidates({ nama: 'Ningsih Purwanti, S.H.' });
        const b = photoCandidates({ nama: 'H. Ningsih Purwanti SH' });
        expect(a).toContain('assets/personel/ningsih-purwanti.jpg');
        expect(b).toContain('assets/personel/ningsih-purwanti.jpg');
    });

    it('kolom FOTO selalu diprioritaskan', () => {
        const list = photoCandidates({ nama: 'Andi Baso', foto: 'khusus/andi.png' });
        expect(list[0]).toBe('khusus/andi.png');
    });

    it('mendukung ekstensi selain jpg', () => {
        const list = photoCandidates({ nama: 'Andi Baso' });
        expect(list).toContain('assets/personel/andi-baso.webp');
        expect(list).toContain('assets/personel/andi-baso.png');
    });
});

describe('resolvePhotoUrl', () => {
    it('memilih kandidat yang terdaftar di manifes', async () => {
        const url = await resolvePhotoUrl(
            { nama: 'Andi Baso, S.Sos.', kabkota: 'Kota Makassar' },
            { manifest: new Set(['kota-makassar/andi-baso.jpg']) }
        );
        expect(url).toBe('assets/personel/kota-makassar/andi-baso.jpg');
    });

    it('mengembalikan null ketika foto tidak ada (bukan URL rusak)', async () => {
        const url = await resolvePhotoUrl({ nama: 'Tanpa Foto' }, { manifest: new Set() });
        expect(url).toBeNull();
    });

    it('membatasi jumlah percobaan sesuai maxProbes', async () => {
        const tried = [];
        const url = await resolvePhotoUrl(
            { nama: 'Zulkifli Hasan' },
            { manifest: null, maxProbes: 3, probe: async (u) => { tried.push(u); return false; } }
        );
        expect(url).toBeNull();
        expect(tried).toHaveLength(3);
    });

    it('hasil resolusi di-cache (tidak menembak ulang)', async () => {
        let calls = 0;
        const opts = { manifest: null, probe: async () => { calls += 1; return true; } };
        await resolvePhotoUrl({ nama: 'Siti Aminah' }, opts);
        await resolvePhotoUrl({ nama: 'Siti Aminah' }, opts);
        expect(calls).toBe(1);
    });
});
