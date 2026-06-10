// filters.js

import { state } from './state.js';

/**
 * Setup filter UI event listeners.
 * @param {Function} onFrontendFilterChange - callback for client-side filtering
 * @param {Function} onBackendFilterChange - callback for filters that require re-fetching
 */
export function initFilters(onFrontendFilterChange, onBackendFilterChange) {
    const volInput = document.getElementById('filter-vol-ratio');
    volInput?.addEventListener('input', () => {
        state.filters.volRatio = parseFloat(volInput.value) || 0;
        onFrontendFilterChange?.();
    });

    const oiInput = document.getElementById('filter-oi-chg');
    oiInput?.addEventListener('input', () => {
        state.filters.oiChg = parseFloat(oiInput.value) || 0;
        onFrontendFilterChange?.();
    });

    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.type = btn.dataset.val || 'ALL';
            onFrontendFilterChange?.();
        });
    });

    const expirySelect = document.getElementById('filter-expiry');
    expirySelect?.addEventListener('change', () => {
        state.filters.expiry = expirySelect.value;
        onBackendFilterChange?.();
    });
}

/**
 * Apply active filters to a processed data array.
 */
export function applyFilters(data) {
    return data.filter(d => {
        // Universe filter
        if (!state.selectedUniverse.includes(d.symbol)) return false;

        // Vol ratio
        if (d.volRatio < (state.filters.volRatio || 0)) return false;

        // OI change %
        if (Math.abs(d.oiChgPct) < (state.filters.oiChg || 0)) return false;

        // CE/PE type
        if (state.filters.type !== 'ALL' && d.type !== state.filters.type) return false;

        // Expiry
        if (state.filters.expiry !== 'ALL' && d.expiry !== state.filters.expiry) return false;

        return true;
    });
}
