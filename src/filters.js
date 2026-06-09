// filters.js

import { state } from './state.js';

export function initFilters() {
    // Vol ratio filter
    const volInput = document.getElementById('filter-vol-ratio');
    if (volInput) {
        volInput.addEventListener('input', () => {
            state.filters.volRatio = parseFloat(volInput.value) || 1.0;
        });
    }

    // OI change filter
    const oiInput = document.getElementById('filter-oi-chg');
    if (oiInput) {
        oiInput.addEventListener('input', () => {
            state.filters.oiChg = parseFloat(oiInput.value) || 0;
        });
    }

    // CE/PE/ALL toggle
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.type = btn.dataset.val || 'ALL';
        });
    });

    // Expiry filter
    const expirySelect = document.getElementById('filter-expiry');
    if (expirySelect) {
        expirySelect.addEventListener('change', () => {
            state.filters.expiry = expirySelect.value;
        });
    }
}

export function applyFilters(data) {
    return data.filter(d => {
        // If no universe selected, show all
        if (
            state.selectedUniverse.length > 0 &&
            !state.selectedUniverse.includes(d.symbol)
        ) return false;

        if (d.volRatio < (state.filters.volRatio || 0)) return false;

        if (
            state.filters.type !== 'ALL' &&
            d.type !== state.filters.type
        ) return false;

        if (
            state.filters.expiry !== 'ALL' &&
            d.expiry !== state.filters.expiry
        ) return false;

        return true;
    });
}
