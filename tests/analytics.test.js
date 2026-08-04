import { describe, it, expect } from 'vitest';
import { countBy, completeness, crossTab, kpis } from '../assets/js/analytics.js';

describe('analytics.js Pure Calculations', () => {
    const sampleRecords = [
        {
            nama: 'Arya',
            provinsi: 'Bali',
            gender: 'Laki-laki',
            pendidikan: 'S1',
            _completeness: 80,
            hp: '628123',
            emailP: 'a@a.com',
        },
        {
            nama: 'Budi',
            provinsi: 'Jawa Timur',
            gender: 'Laki-laki',
            pendidikan: 'S2',
            _completeness: 100,
            hp: '628124',
            emailK: 'b@b.com',
        },
        {
            nama: 'Citra',
            provinsi: 'Bali',
            gender: 'Perempuan',
            pendidikan: 'S1',
            _completeness: 60,
            emailP: 'c@c.com',
        },
    ];

    describe('countBy()', () => {
        it('should correctly count occurrences by key', () => {
            const result = countBy(sampleRecords, 'provinsi');
            expect(result.labels).toEqual(['Bali', 'Jawa Timur']);
            expect(result.values).toEqual([2, 1]);
        });

        it('should respect limits and group rest into Lainnya', () => {
            const result = countBy(sampleRecords, 'provinsi', { limit: 1 });
            expect(result.labels).toEqual(['Bali', 'Lainnya']);
            expect(result.values).toEqual([2, 1]);
        });
    });

    describe('completeness()', () => {
        it('should return completeness percentages for key fields', () => {
            const result = completeness(sampleRecords);
            const hpStat = result.find((r) => r.label === 'Nomor HP/WhatsApp');
            expect(hpStat.value).toBe(67); // 2 out of 3 records have HP
        });
    });

    describe('kpis()', () => {
        it('should calculate correct dashboard KPI cards', () => {
            const stats = kpis(sampleRecords, sampleRecords);
            const total = stats.find((s) => s.label === 'Total Personel');
            const provs = stats.find((s) => s.label === 'Cakupan Provinsi');
            expect(total.value).toBe(3);
            expect(provs.value).toBe(2);
        });
    });
});
