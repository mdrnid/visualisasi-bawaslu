import { describe, it, expect } from 'vitest';
import {
    mapHeader,
    headerScore,
    normGender,
    normPendidikan,
    normAgama,
    normPhone,
    normHandle,
    normUrl,
    normalizeRecord,
    validateRecord,
    findDuplicates,
    isBlank,
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
            expect(normGender('Random')).toBe('Random');
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
});
