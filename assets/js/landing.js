/**
 * Inisialisasi statistik dinamis pada landing page dari dataset aktual.
 */
import { loadDataset } from './data-service.js';
import { completeness } from './analytics.js';

const set = (name, value) => {
    const el = document.querySelector('[data-stat="' + name + '"]');
    if (el) el.textContent = value;
};

loadDataset()
    .then(({ records }) => {
        set('personel', records.length);
        set('personel-hero', records.length);
        set('kabkota', new Set(records.map((r) => r.kabkota).filter(Boolean)).size);
        set('provinsi', new Set(records.map((r) => r.provinsi).filter(Boolean)).size || 1);
        set('kelengkapan', Math.round(completeness(records)) + '%');
        set('kelengkapan-hero', Math.round(completeness(records)) + '%');
    })
    .catch((err) => {
        console.warn('Gagal memuat live data untuk landing page:', err);
        document.querySelector('.mini-badge')?.remove();
    });

// ---------- Modal Developed By (Tim Magang) ----------
const btnCredit = document.getElementById('btnCreditLanding');
const modalCredit = document.getElementById('modalCreditLanding');
const btnClose = document.getElementById('btnCloseModalCreditLanding');
const backdrop = document.getElementById('closeModalCreditLanding');

if (btnCredit && modalCredit) {
    const openModal = () => {
        modalCredit.hidden = false;
        modalCredit.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
    const closeModal = () => {
        modalCredit.hidden = true;
        modalCredit.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    btnCredit.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalCredit.hidden) {
            closeModal();
        }
    });
}

