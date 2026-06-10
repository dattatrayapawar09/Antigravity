// smartapi.js — Angel One SmartAPI frontend service

import { state } from './state.js';

const PROD_BACKEND_URL = 'https://antigravity-backend.onrender.com';

const IS_LOCAL =
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'file:';

export const BACKEND_URL =
    IS_LOCAL ? 'http://localhost:3001' : PROD_BACKEND_URL;

export const SmartApiService = {

    /**
     * Check backend auth status. If not authenticated, trigger login.
     */
    async checkStatus() {
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/auth/status`,
                { signal: AbortSignal.timeout(5000) }
            );
            const data = await res.json();
            state.apiConnected = !!data.connected;
        } catch {
            state.apiConnected = false;
        }

        // If backend is reachable but not authenticated, trigger login
        if (!state.apiConnected) {
            await this.triggerLogin();
        }

        this.updateBadge();
        return state.apiConnected;
    },

    /**
     * Ask backend to (re)authenticate with Angel One SmartAPI.
     */
    async triggerLogin() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(20000)
            });
            const data = await res.json();
            state.apiConnected = !!data.connected;
            if (state.apiConnected) {
                console.log('[SmartAPI] Auto-login successful — LIVE MODE');
            } else {
                console.warn('[SmartAPI] Auto-login failed:', data);
            }
        } catch (err) {
            console.warn('[SmartAPI] Login request failed:', err.message);
            state.apiConnected = false;
        }
        this.updateBadge();
    },

    /**
     * Fetch option chain from backend.
     * Returns { options, expiries } or null.
     */
    async fetchOptionChain(symbols, expiry = null) {
        if (!state.apiConnected) return null;
        if (!symbols || symbols.length === 0) return null;

        try {
            const res = await fetch(`${BACKEND_URL}/api/instruments/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols, expiry }),
                signal: AbortSignal.timeout(30000)
            });

            if (!res.ok) {
                console.warn('[SmartAPI] Options fetch HTTP error:', res.status);
                return null;
            }

            const data = await res.json();

            if (data.mode === 'MOCK' || data.mode === 'LOADING') {
                console.warn('[SmartAPI] Backend returned mode=' + data.mode + ' — not live yet');
                // Re-try auth in the background
                this.triggerLogin();
                return null;
            }

            if (data.options && data.options.length > 0) {
                // Update spot cache from the returned options
                data.options.forEach(opt => {
                    if (opt.spot && opt.symbol) {
                        state.liveSpotCache[opt.symbol] = opt.spot;
                    }
                });
                return { options: data.options, expiries: data.expiries || [] };
            }

            console.warn('[SmartAPI] Options returned empty array');
            return null;

        } catch (err) {
            console.warn('[SmartAPI] fetchOptionChain error:', err.message);
            return null;
        }
    },

    getLiveSpot(symbol) {
        return state.liveSpotCache[symbol] || null;
    },

    updateBadge() {
        const badge = document.getElementById('api-status-badge');
        if (!badge) return;

        if (state.apiConnected) {
            badge.className = 'api-badge live';
            badge.innerHTML = '<span class="pulse-indicator"></span> SmartAPI Live';
        } else {
            badge.className = 'api-badge mock';
            badge.innerHTML = '<span></span> Mock Mode';
        }
    }
};
