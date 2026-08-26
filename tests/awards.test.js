import { describe, expect, it } from 'vitest';
import { attachAwards, awardCategory, nameKey, normalizeAwards, personKey, splitAwardText } from '../assets/js/awards.js';

const RAW = [
    {
        kabkota: 'Kabupaten Jeneponto',
        nama: 'Bustanil Nassa, S.Hi., MH',
        jabatan: 'Anggota',
        penghargaan: 'Narasumber Pendidikan Pengawas Partisipatif',
        bukti: 'https://drive.google.com/file/d/1Z2aPjaTsvnuOooacGvXEauRrMpaWg3DL/view',
    },
    {
        // salah ketik nama pada data sumber: "Bustani"
        kabkota: 'Kabupaten Jeneponto',
        nama: 'Bustani Nassa, S.Hi., MH',
        jabatan: 'Anggota',
        penghargaan: 'Diskusi Awal Pekan dengan topik: Urgensi Reformasi Sistem Kepartaian dan Pemilu',
        bukti: 'https://drive.google.com/file/d/15aIYbn7jry8VELJ71Q1xHwyC4Xpk9nKu/view',
    },
    {
        kabkota: 'Kabupaten Bone',
        nama: 'Dr. Nur Alim, S.H., M.H.Kes',
        jabatan: 'Anggota',
        penghargaan:
            '1. Penanganan Perkara Pidana Terbanyak Tingkat Kabupaten/Kota 2. Narasumber Pendidikan Pengawas Partisipatif Tahun 2026 3. Narasumber Kursus Hukum Pemilu.',
        bukti: 'https://drive.google.com/drive/folders/1W5pnDLhN5fDopteDV9SMczr0I0nOy4-z',
    },
    {
        kabkota: 'Kabupaten Bone',
        nama: 'Rohzali Putra Badaruddin, S.H',
        jabatan: 'Anggota',
        penghargaan: 'Fasilitator Pendidikan Pengawas Partisipatif Tahun 2026',
        bukti: 'javascript:alert(1)',
    },
];

describe('kunci pencocokan', () => {
    it('membuang awalan wilayah dan gelar', () => {
        expect(personKey('Kabupaten Jeneponto', 'Bustanil Nassa, S.Hi., MH')).toBe('jeneponto|bustanil-nassa');
        expect(nameKey('Dr.Kamridah Habe, S.Pd.I., M.Pd')).toBe('kamridah-habe');
    });
});

describe('normalisasi', () => {
    it('memecah sel bernomor menjadi beberapa penghargaan', () => {
        expect(splitAwardText('1. Satu 2. Dua 3. Tiga.')).toHaveLength(3);
        expect(splitAwardText('Pelatihan Mediasi')).toEqual(['Pelatihan Mediasi']);
    });

    it('mengategorikan dan menolak tautan tidak aman tapi menerima path lokal', () => {
        const list = normalizeAwards(RAW);
        expect(list).toHaveLength(6); // 1 + 1 + 3 + 1
        expect(awardCategory('Terbaik III Untuk Kategori Drafter Putusan')).toBe('Prestasi');
        expect(list.find((a) => a.kategori === 'Fasilitator').bukti).toBe('');
    });

    it('menerima path berkas bukti lokal yang valid', () => {
        const item = normalizeAwards([
            {
                kabkota: 'Kabupaten Jeneponto',
                nama: 'Bustanil Nassa',
                penghargaan: 'Drafter Terbaik',
                bukti: 'assets/awards/jeneponto/bustanil-nassa/01-drafter-terbaik.pdf',
            },
        ])[0];
        expect(item.bukti).toBe('assets/awards/jeneponto/bustanil-nassa/01-drafter-terbaik.pdf');
        expect(item._proofType).toBe('pdf');
    });
});

describe('attachAwards', () => {
    const records = [
        { nama: 'BUSTANIL NASSA, S.HI., MH', kabkota: 'Kabupaten Jeneponto' },
        { nama: 'Nur Alim', kabkota: 'Kabupaten Bone' },
        { nama: 'Rohzali Putra Badaruddin', kabkota: 'Kabupaten Bone' },
        { nama: 'Andi Tanpa Penghargaan', kabkota: 'Kabupaten Bone' },
    ];
    const linkage = attachAwards(records, normalizeAwards(RAW));

    it('mencocokkan nama bergelar, huruf kapital, dan satu salah ketik', () => {
        expect(records[0]._awardCount).toBe(2);
        expect(records[1]._awardCount).toBe(3);
        expect(records[2]._awardCount).toBe(1);
        expect(records[3]._awardCount).toBe(0);
    });

    it('tidak menyisakan penghargaan tanpa pemilik', () => {
        expect(linkage.unmatched).toHaveLength(0);
        expect(linkage.matchedPeople).toBe(3);
    });

    it('menempatkan prestasi di urutan atas', () => {
        expect(records[1]._awards[0].kategori).toBe('Prestasi');
    });
});
