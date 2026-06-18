// app.js

import { state } from './state.js';

import {
    generateInitialData,
    ALL_FNO_SYMBOLS
} from './market.js';

import {
    renderDashboard
} from './ui.js';

import {
    SmartApiService
} from './smartapi.js';

async function refreshData() {

    try {

        await SmartApiService.checkStatus();

        await generateInitialData(
            state.selectedUniverse
        );

        renderDashboard();

    }
    catch (err) {

        console.error(
            '[App] Refresh error:',
            err
        );
    }
}

async function init() {

    state.selectedUniverse =
        [...ALL_FNO_SYMBOLS];

    await refreshData();

    startPolling();
}

function startPolling() {

    if (state.updateInterval) {

        clearInterval(
            state.updateInterval
        );
    }

    state.updateInterval =
        setInterval(
            refreshData,
            10000
        );
}

document.addEventListener(
    'DOMContentLoaded',
    init
);
