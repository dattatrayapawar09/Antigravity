// filters.js

import { state } from './state.js';
import { generateInitialData } from './market.js';
import { renderDashboard } from './ui.js';

export function initFilters() {

    // ----------------------------
    // Volume Ratio
    // ----------------------------

    const volRatio =
        document.getElementById('filter-vol-ratio');

    volRatio?.addEventListener('input', () => {

        state.filters.volRatio =
            Number(volRatio.value) || 1;

        renderDashboard();

    });

    // ----------------------------
    // OI Change
    // ----------------------------

    const oiChange =
        document.getElementById('filter-oi-chg');

    oiChange?.addEventListener('input', () => {

        state.filters.oiChg =
            Number(oiChange.value) || 0;

        renderDashboard();

    });

    // ----------------------------
    // CE / PE
    // ----------------------------

    document
        .querySelectorAll('.toggle-btn')
        .forEach(btn => {

            btn.addEventListener('click', () => {

                document
                    .querySelectorAll('.toggle-btn')
                    .forEach(x => x.classList.remove('active'));

                btn.classList.add('active');

                state.filters.type =
                    btn.dataset.val;

                renderDashboard();

            });

        });

    // ----------------------------
    // Expiry
    // ----------------------------

    const expiry =
        document.getElementById('filter-expiry');

    expiry?.addEventListener('change', async () => {

        state.filters.expiry =
            expiry.value;

        await generateInitialData();

        renderDashboard();

    });

    // ----------------------------
    // Universe Multi Select
    // ----------------------------

    const universe =
        document.getElementById('filter-universe');

    universe?.addEventListener('change', async () => {

        const selected = [];

        [...universe.options]
            .forEach(opt => {

                if (opt.selected)
                    selected.push(opt.value);

            });

        state.selectedUniverse = selected;

        await generateInitialData(selected);

        renderDashboard();

    });

}
