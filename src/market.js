// market.js — Market data generation + live data fetching

import { state } from './state.js';
import { SmartApiService } from './smartapi.js';

export const INDEX_SYMBOLS  = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
export const STOCK_SYMBOLS  = ['RELIANCE', 'SBIN', 'INFY', 'TCS', 'HDFCBANK',
                               'ICICIBANK', 'ADANIENT', 'WIPRO', 'AXISBANK', 'MARUTI'];
export const ALL_FNO_SYMBOLS = [...INDEX_SYMBOLS, ...STOCK_SYMBOLS];

// ── Mock spot prices (used only in mock mode) ───────────────────────────────
const MOCK_SPOTS = {
    NIFTY: 24500, BANKNIFTY: 52000, FINNIFTY: 23800, MIDCPNIFTY: 12500,
    RELIANCE: 2950, SBIN: 820, INFY: 1480, TCS: 3800,
    HDFCBANK: 1720, ICICIBANK: 1250, ADANIENT: 2680, WIPRO: 480,
    AXISBANK: 1190, MARUTI: 12400
};

// ── Strike step sizes (used only in mock mode) ──────────────────────────────
const STRIKE_STEP = {
    NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25,
    RELIANCE: 20, SBIN: 10, INFY: 20, TCS: 50,
    HDFCBANK: 20, ICICIBANK: 20, ADANIENT: 50, WIPRO: 10,
    AXISBANK: 20, MARUTI: 100
};

// ── Previous avgVol cache — persists across refreshes to keep column stable ─
// key: `${symbol}_${strike}_${type}` → avgVol number
const avgVolCache = {};

/**
 * Populate expiry dropdown from the live expiries returned by backend.
 * Only rebuilds the DOM if the expiry list has actually changed.
 */
function populateExpiryDropdown(expiries) {
    const expirySelect = document.getElementById('filter-expiry');
    if (!expirySelect || !Array.isArray(expiries) || expiries.length === 0) return;

    const currentExpiries = Array.from(expirySelect.options)
        .map(o => o.value)
        .filter(v => v !== 'ALL');

    if (currentExpiries.join(',') === expiries.join(',')) return; // nothing changed

    const previousSelected = expirySelect.value;
    expirySelect.innerHTML = '<option value="ALL">All Expiries</option>';
    expiries.forEach(exp => {
        const opt = document.createElement('option');
        opt.value = exp;
        opt.textContent = exp;
        expirySelect.appendChild(opt);
    });

    // Restore previous selection if it is still valid
    expirySelect.value = expiries.includes(previousSelected) ? previousSelected : 'ALL';
    if (!expiries.includes(previousSelected)) {
        state.filters.expiry = 'ALL';
    }
}

/**
 * Main data refresh function.
 *
 * LIVE MODE (apiConnected = true):
 *   → Calls /api/instruments/options which returns exact strike prices,
 *     LTPs, OI, Volume directly from Angel One for the selected universe.
 *   → Updates expiry dropdown with real expiry dates from scrip master.
 *   → Updates state.liveSpotCache via smartapi.js.
 *
 * MOCK MODE (apiConnected = false):
 *   → Generates synthetic data based on MOCK_SPOTS and STRIKE_STEP.
 *   → Never sent to production — only for offline testing.
 */
export async function generateInitialData() {

    // ── LIVE PATH ─────────────────────────────────────────────────────────────
    if (state.apiConnected) {
        if (state.selectedUniverse.length === 0) {
            state.marketData = [];
            return;
        }

        const expiryToFetch = state.filters.expiry === 'ALL' ? null : state.filters.expiry;

        const response = await SmartApiService.fetchOptionChain(
            state.selectedUniverse,
            expiryToFetch
        );

        if (response && Array.isArray(response.options) && response.options.length > 0) {
            // Populate expiry dropdown with real dates
            populateExpiryDropdown(response.expiries);

            // Build new market data — preserve avgVol from previous cycles
            const newMarketData = response.options.map(opt => {
                const key = opt.id;  // e.g. "NIFTY_24500_CE"

                // Update rolling avgVol cache
                // Use the live volume as a seed if we don't have a prior cached value yet
                if (opt.avgVol && opt.avgVol > 0) {
                    avgVolCache[key] = opt.avgVol;
                }

                const cachedAvg = avgVolCache[key];
                // Fallback: estimate avgVol as 80% of current volume (backend heuristic)
                const avgVol = cachedAvg || (opt.volume > 0 ? Math.round(opt.volume * 0.8) : 1000);

                return {
                    ...opt,
                    avgVol
                };
            });

            state.marketData = newMarketData;
            console.log(`[Market] Live data loaded: ${newMarketData.length} contracts`);
            return;
        }

        console.warn('[Market] Live fetch returned no data — falling back to mock');
        // Fall through to mock mode below
    }

    // ── MOCK PATH ─────────────────────────────────────────────────────────────
    if (state.selectedUniverse.length === 0) {
        state.marketData = [];
        return;
    }

    state.marketData = [];

    state.selectedUniverse.forEach(symbol => {
        const spot = SmartApiService.getLiveSpot(symbol) || MOCK_SPOTS[symbol] || 1000;
        const step = STRIKE_STEP[symbol] || 50;
        const atm  = Math.round(spot / step) * step;

        for (let i = -5; i <= 5; i++) {
            const strike = atm + (i * step);

            ['CE', 'PE'].forEach(type => {
                const id = `${symbol}_${strike}_${type}`;

                // Stable avgVol — re-use cached or generate once
                if (!avgVolCache[id]) {
                    avgVolCache[id] = Math.floor(5000 + Math.random() * 15000);
                }
                const avgVol = avgVolCache[id];

                const itm       = type === 'CE' ? spot - strike : strike - spot;
                const intrinsic = Math.max(0, itm);
                const extrinsic = Math.max(5, 150 - Math.abs(i) * 25 + (Math.random() - 0.5) * 20);
                const price     = +(intrinsic + extrinsic).toFixed(2);
                const prevPrice = +(price * (0.97 + Math.random() * 0.06)).toFixed(2);
                const volume    = Math.floor(avgVol * (0.6 + Math.random() * 1.8));
                const oi        = Math.floor(20000 + Math.random() * 100000);
                const prevOi    = Math.floor(oi * (0.90 + Math.random() * 0.20));
                const iv        = +(15 + Math.random() * 20 + Math.abs(i) * 1.5).toFixed(1);

                state.marketData.push({
                    id, symbol, strike, type,
                    expiry:    'MOCK',
                    spot,
                    price,
                    prevPrice,
                    volume,
                    avgVol,
                    oi,
                    prevOi,
                    iv
                });
            });
        }
    });

    console.log(`[Market] Mock data generated: ${state.marketData.length} contracts`);
}

export async function initMarket() {
    await generateInitialData();
}
