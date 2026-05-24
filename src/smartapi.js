// smartapi.js

import { state } from './state.js';

const PROD_BACKEND_URL = 'https://antigravity-backend.onrender.com';

const IS_LOCAL =
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'file:';

export const BACKEND_URL =
    IS_LOCAL ? 'http://localhost:3001' : PROD_BACKEND_URL;

export const SmartApiService = {

    async checkStatus() {
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/auth/status`,
                { signal: AbortSignal.timeout(3000) }
            );

            const data = await res.json();

            state.apiConnected = !!data.connected;

        } catch {
            state.apiConnected = false;
        }

        this.updateBadge();

        return state.apiConnected;
    },

    async refreshSpotPrices(symbols) {

        if (!state.apiConnected) return;

        try {

            const res = await fetch(
                `${BACKEND_URL}/api/instruments/spot`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ symbols }),
                    signal: AbortSignal.timeout(30000)
                }
            );

            const data = await res.json();

            if (data.spotPrices) {
                Object.assign(
                    state.liveSpotCache,
                    data.spotPrices
                );
            }

        } catch (err) {
            console.warn(err);
        }
    },

    getLiveSpot(symbol) {
        return state.liveSpotCache[symbol] || null;
    },

    updateBadge() {

        const badge =
            document.getElementById('api-status-badge');

        if (!badge) return;

        if (state.apiConnected) {

            badge.className = 'api-badge live';

            badge.innerHTML =
                '<span class="pulse-indicator"></span> SmartAPI Live';

        } else {

            badge.className = 'api-badge mock';

            badge.innerHTML =
                '<span></span> Mock Mode';
        }
    }
};
