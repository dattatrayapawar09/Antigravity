// app.js

import { state } from './state.js';

import {
    generateInitialData,
    ALL_FNO_SYMBOLS
} from './market.js';

import {
    renderDashboard,
    initUI
} from './ui.js';

import {
    initFilters
} from './filters.js';

import {
    SmartApiService
} from './smartapi.js';

async function refreshMarket() {

    try {

        await SmartApiService.checkStatus();

        await generateInitialData();

        renderDashboard();

    }
    catch (err) {

        console.error(
            '[APP]',
            err
        );

    }

}

function startPolling() {

    if (state.updateInterval) {

        clearInterval(
            state.updateInterval
        );

    }

    state.updateInterval =
        setInterval(
            refreshMarket,
            5000
        );

}

async function init() {

    console.log(
        'Options Pulse Tracker starting...'
    );

    state.selectedUniverse =
        [...ALL_FNO_SYMBOLS];

    initUI();

    initFilters();

    await refreshMarket();

    startPolling();

}

document.addEventListener(
    'DOMContentLoaded',
    init
);
