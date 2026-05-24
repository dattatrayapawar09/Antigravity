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

async function init() {

    state.selectedUniverse =
        [...ALL_FNO_SYMBOLS];

    await SmartApiService.checkStatus();

    await generateInitialData();

    renderDashboard();

    startPolling();
}

function startPolling() {

    if (state.updateInterval) {
        clearInterval(state.updateInterval);
    }

    state.updateInterval =
        setInterval(async () => {

            renderDashboard();

        }, 3000);
}

document.addEventListener(
    'DOMContentLoaded',
    init
);
