import { describe, it, expect } from 'vitest';
import {
    mapHeader,
    normGender,
    normPendidikan,
    normPhone,
    validateRecord,
    isBlank,
    normalizeRecord,
    normKabkota,
} from '../assets/js/schema.js';

describe('schema.js Data Contract', () => {
    describe('isBlank()', () => {
        it('should recognize blank inputs', () => {
            expect(isBlank('')).toBe(true);
            expect(isBlank(' - ')).toBe(true);
            expect(isBlank('N/A')).toBe(true);
            expect(isBlank('null')).toBe(true);
            expect(isBlank('tidak ada')).toBe(true);
            expect(isBlank('Bawaslu')).toBe(false);
        });
    });

    describe('mapHeader()', () => {
        it('should map various headers to canonical keys', () => {
            expect(mapHeader('PROVINSI')).toBe('provinsi');
            expect(mapHeader('prov')).toBe('provinsi');
            expect(mapHeader('NO. HP')).toBe('hp');
            expect(mapHeader('whatsapp')).toBe('hp');
            expect(mapHeader('E-MAIL KANTOR')).toBe('emailK');
            expect(mapHeader('NAMA LENGKAP')).toBe('nama');
            expect(mapHeader('GENDER')).toBe('gender');
            expect(mapHeader('unknown_column')).toBeNull();
        });
    });

    describe('normGender()', () => {
        it('should normalize gender standard forms', () => {
            expect(normGender('L')).toBe('Laki-laki');
            expect(normGender('pria')).toBe('Laki-laki');
            expect(normGender('p')).toBe('Perempuan');
            expect(normGender('wanita')).toBe('Perempuan');
            expect(normGender('Random')).toBe('');
        });
    });

    describe('normPendidikan()', () => {
        it('should normalize education levels', () => {
            expect(normPendidikan('s1')).toBe('S1');
            expect(normPendidikan('Sarjana')).toBe('S1');
            expect(normPendidikan('s2 magister')).toBe('S2');
            expect(normPendidikan('sma')).toBe('SLTA');
            expect(normPendidikan('d3')).toBe('Diploma');
        });
    });

    describe('normPhone()', () => {
        it('should normalize phone numbers to country code format', () => {
            expect(normPhone('08123456789')).toBe('628123456789');
            expect(normPhone('+628123456789')).toBe('628123456789');
            expect(normPhone('628123456789')).toBe('628123456789');
        });
    });

    describe('validateRecord()', () => {
        it('should catch validation errors', () => {
            const invalidRecord = {
                nama: '',
                provinsi: '',
                emailP: 'invalid-email',
                hp: '123',
            };
            const issues = validateRecord(invalidRecord);
            expect(issues.some((i) => i.field === 'Nama')).toBe(true);
            expect(issues.some((i) => i.field === 'Provinsi')).toBe(true);
            expect(issues.some((i) => i.field === 'E-mail Pribadi')).toBe(true);
            expect(issues.some((i) => i.field === 'Nomor HP/WhatsApp')).toBe(true);
        });
    });

    describe('normalizeRecord()', () => {
        it('should convert matching provinsi and kabkota to "Provinsi [Name]" format', () => {
            const raw = {
                provinsi: 'SULAWESI SELATAN',
                kabkota: 'SULAWESI SELATAN',
                nama: 'MARDIANA RUSLI',
                __row: 83,
            };
            const normalized = normalizeRecord(raw, 0);
            expect(normalized.provinsi).toBe('Sulawesi Selatan');
            expect(normalized.kabkota).toBe('Provinsi Sulawesi Selatan');
            expect(normalized.nama).toBe('Mardiana Rusli');
        });

        it('should keep different kabkota values unchanged', () => {
            const raw = {
                provinsi: 'SULAWESI SELATAN',
                kabkota: 'BONE',
                nama: 'ALWI',
                __row: 8,
            };
            const normalized = normalizeRecord(raw, 0);
            expect(normalized.provinsi).toBe('Sulawesi Selatan');
            expect(normalized.kabkota).toBe('Bone');
            expect(normalized.nama).toBe('Alwi');
        });

        it('should correctly normalize and preserve academic titles with comma and period', () => {
            const raw1 = { nama: 'Muhammad Alwi, S.Ag.,M.Pd' };
            const raw2 = { nama: 'Muhammad Alwi, S.Ag.,m.Pd' };
            const raw3 = { nama: 'MUHAMMAD ALWI, S.AG., M.PD' };
            const raw4 = { nama: 'Andi Baso, S.IP' };

            expect(normalizeRecord(raw1, 0).nama).toBe('Muhammad Alwi, S.Ag.,M.Pd');
            expect(normalizeRecord(raw2, 0).nama).toBe('Muhammad Alwi, S.Ag.,M.Pd');
            expect(normalizeRecord(raw3, 0).nama).toBe('Muhammad Alwi, S.Ag., M.Pd');
            expect(normalizeRecord(raw4, 0).nama).toBe('Andi Baso, S.IP');
        });

        it('should normalize kabkota to canonical naming in normalizeRecord', () => {
            expect(normalizeRecord({ kabkota: 'Pangkajene dan Kepulauan' }, 0).kabkota).toBe('Pangkep');
            expect(normalizeRecord({ kabkota: 'Makassar' }, 0).kabkota).toBe('Kota Makassar');
            expect(normalizeRecord({ kabkota: 'Kota Makassar' }, 0).kabkota).toBe('Kota Makassar');
            expect(normalizeRecord({ kabkota: 'Kabupaten Takalar' }, 0).kabkota).toBe('Takalar');
            expect(normalizeRecord({ kabkota: 'Sidenreng Rappang' }, 0).kabkota).toBe('Sidrap');
            expect(normalizeRecord({ kabkota: 'Kepulauan Selayar' }, 0).kabkota).toBe('Selayar');
        });
    });

    describe('normKabkota()', () => {
        it('should normalize aliases to canonical names', () => {
            expect(normKabkota('Makassar')).toBe('Kota Makassar');
            expect(normKabkota('Kota Makassar')).toBe('Kota Makassar');
            expect(normKabkota('kotamadya makassar')).toBe('Kota Makassar');
            expect(normKabkota('Pangkajene dan Kepulauan')).toBe('Pangkep');
            expect(normKabkota('Kabupaten Pangkep')).toBe('Pangkep');
            expect(normKabkota('pangkep')).toBe('Pangkep');
            expect(normKabkota('Parepare')).toBe('Kota Parepare');
            expect(normKabkota('Kota Parepare')).toBe('Kota Parepare');
            expect(normKabkota('Pare-Pare')).toBe('Kota Parepare');
            expect(normKabkota('Palopo')).toBe('Kota Palopo');
            expect(normKabkota('Kota Palopo')).toBe('Kota Palopo');
            expect(normKabkota('Kabupaten Takalar')).toBe('Takalar');
            expect(normKabkota('Takalar')).toBe('Takalar');
            expect(normKabkota('Sidenreng Rappang')).toBe('Sidrap');
            expect(normKabkota('Sidrap')).toBe('Sidrap');
            expect(normKabkota('Kepulauan Selayar')).toBe('Selayar');
            expect(normKabkota('Selayar')).toBe('Selayar');
            expect(normKabkota('Kabupaten Bantaeng')).toBe('Bantaeng');
            expect(normKabkota('Bantaeng')).toBe('Bantaeng');
            expect(normKabkota('Luwu Timur')).toBe('Luwu Timur');
            expect(normKabkota('lutim')).toBe('Luwu Timur');
            expect(normKabkota('Provinsi Sulawesi Selatan')).toBe('Provinsi Sulawesi Selatan');
            expect(normKabkota('Sulawesi Selatan')).toBe('Provinsi Sulawesi Selatan');
            expect(normKabkota('')).toBe('');
        });
    });
});
