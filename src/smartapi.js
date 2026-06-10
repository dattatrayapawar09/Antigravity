// smartapi.js — Angel One SmartAPI frontend service

import { state } from './state.js';

const PROD_BACKEND_URL = 'https://antigravity-backend.onrender.com';

const IS_LOCAL =
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'file:';

export const BACKEND_URL = IS_LOCAL ? 'http://localhost:3001' : PROD_BACKEND_URL;

// Rate-limit login attempts — don't hammer backend
let _lastLoginAttempt    = 0;
const LOGIN_COOLDOWN_MS  = 30_000; // 30 seconds between login attempts

export const SmartApiService = {

    /**
     * Check backend auth status.
     * If not authenticated and cooldown has elapsed, triggers login automatically.
     */
    async checkStatus() {
        try {
            const res  = await fetch(`${BACKEND_URL}/api/auth/status`,
                { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const wasConnected = state.apiConnected;
            state.apiConnected = !!data.connected;

            // If backend is up but not logged in, trigger login (rate-limited)
            if (!state.apiConnected) {
                const now = Date.now();
                if (now - _lastLoginAttempt >= LOGIN_COOLDOWN_MS) {
                    _lastLoginAttempt = now;
                    this.triggerLogin();   // fire-and-forget
                }
            }

        } catch {
            state.apiConnected = false;
        }

        this.updateBadge();
        return state.apiConnected;
    },

    /**
     * Ask the backend to authenticate with Angel One SmartAPI.
     * Returns true if login succeeded.
     */
    async triggerLogin() {
        try {
            console.log('[SmartAPI] Triggering backend login…');
            const res  = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({}),
                signal:  AbortSignal.timeout(25000)
            });
            const data = await res.json();
            state.apiConnected = !!data.connected;

            if (state.apiConnected) {
                console.log('[SmartAPI] ✅ Login successful — LIVE MODE');
            } else {
                console.warn('[SmartAPI] ❌ Login failed:', data);
            }
        } catch (err) {
            console.warn('[SmartAPI] Login request error:', err.message);
            state.apiConnected = false;
        }
        this.updateBadge();
        return state.apiConnected;
    },

    /**
     * Fetch the option chain from backend.
     * Returns { options: [...], expiries: [...] } or null.
     */
    async fetchOptionChain(symbols, expiry = null) {
        if (!state.apiConnected) return null;
        if (!symbols || symbols.length === 0) return null;

        try {
            const res = await fetch(`${BACKEND_URL}/api/instruments/options`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ symbols, expiry }),
                signal:  AbortSignal.timeout(35000)
            });

            if (!res.ok) {
                console.warn('[SmartAPI] Options HTTP error:', res.status);
                return null;
            }

            const data = await res.json();

            if (data.mode === 'MOCK' || data.mode === 'LOADING') {
                console.warn('[SmartAPI] Backend not live yet (mode=' + data.mode + ')');
                state.apiConnected = false;
                this.updateBadge();
                return null;
            }

            if (!Array.isArray(data.options) || data.options.length === 0) {
                console.warn('[SmartAPI] Options returned empty');
                return null;
            }

            // Update spot cache from options data
            data.options.forEach(opt => {
                if (opt.spot > 0 && opt.symbol) {
                    state.liveSpotCache[opt.symbol] = opt.spot;
                }
            });

            return {
                options:  data.options,
                expiries: data.expiries || []
            };

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
            badge.className  = 'api-badge live';
            badge.innerHTML  = '<span class="pulse-indicator"></span> SmartAPI Live';
        } else {
            badge.className  = 'api-badge mock';
            badge.innerHTML  = '<span></span> Mock Mode';
        }
    }
};
