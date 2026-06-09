// market.js — Market data generation + live data fetching

import { state } from './state.js';
import { SmartApiService, BACKEND_URL } from './smartapi.js';

export const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
export const STOCK_SYMBOLS = ['RELIANCE', 'SBIN', 'INFY', 'TCS', 'HDFCBANK',
                              'ICICIBANK', 'ADANIENT', 'WIPRO', 'AXISBANK', 'MARUTI'];
export const ALL_FNO_SYMBOLS = [...INDEX_SYMBOLS, ...STOCK_SYMBOLS];

// Default spot prices for mock mode
const MOCK_SPOTS = {
    NIFTY: 24500, BANKNIFTY: 52000, FINNIFTY: 23800, MIDCPNIFTY: 12500,
    RELIANCE: 2950, SBIN: 820, INFY: 1480, TCS: 3800,
    HDFCBANK: 1720, ICICIBANK: 1250, ADANIENT: 2680, WIPRO: 480,
    AXISBANK: 1190, MARUTI: 12400
};

// Strike step per symbol
const STRIKE_STEP = {
    NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25,
    RELIANCE: 20, SBIN: 10, INFY: 20, TCS: 50,
    HDFCBANK: 20, ICICIBANK: 20, ADANIENT: 50, WIPRO: 10,
    AXISBANK: 20, MARUTI: 100
};

// In-memory store for 5-session avg volumes
// key: `${symbol}_${strike}_${type}` → avgVol
const avgVolCache = {};

/**
 * Fetch 5-session average volume from backend.
 * Falls back to mock values if backend unavailable.
 */
async function fetchAvgVolumes(symbols) {
    if (!state.apiConnected) return; // skip in mock mode

    try {
        const res = await fetch(`${BACKEND_URL}/api/instruments/avgvol`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols }),
            signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) return;

        const data = await res.json();
        if (data.avgVols) {
            Object.assign(avgVolCache, data.avgVols);
        }
    } catch {
        // Silently fall back to mock avg volumes
    }
}

/**
 * Generate/refresh market data.
 * Fetches live spot + option LTPs when apiConnected,
 * otherwise uses randomised mock data.
 */
export async function generateInitialData() {
    if (state.apiConnected) {
        // Live Mode: Fetch from backend endpoint (returns exact mapping, strike, spot, and LTP)
        const liveOptions = await SmartApiService.fetchOptionChain(state.selectedUniverse);
        
        if (liveOptions && liveOptions.length > 0) {
            // Update cache and keep old values if missing to avoid flicker
            const newMarketData = [];
            liveOptions.forEach(opt => {
                // Find existing to preserve or mock avgVol
                const existing = state.marketData.find(m => m.id === opt.id);
                const avgVol = avgVolCache[opt.id] || (existing ? existing.avgVol : Math.floor(3000 + Math.random() * 12000));
                
                newMarketData.push({
                    ...opt,
                    avgVol
                });
            });
            state.marketData = newMarketData;

            // Trigger background fetch for new avg volumes silently
            fetchAvgVolumes(state.selectedUniverse).catch(() => {});
            return;
        }
        // If live fetch fails or returns empty, gracefully fall back to mock mode
    }

    // Mock Mode
    state.marketData = [];
    state.selectedUniverse.forEach(symbol => {
        const spot = SmartApiService.getLiveSpot(symbol) || MOCK_SPOTS[symbol] || 1000;
        const step = STRIKE_STEP[symbol] || 50;
        const atm  = Math.round(spot / step) * step;

        for (let i = -5; i <= 5; i++) {
            const strike = atm + (i * step);

            ['CE', 'PE'].forEach(type => {
                const id = `${symbol}_${strike}_${type}`;

                // Use live avg volume if available, else random mock
                const cachedAvg = avgVolCache[id];
                const avgVol    = cachedAvg
                    ? cachedAvg
                    : Math.floor(3000 + Math.random() * 12000);

                const itm   = type === 'CE' ? spot - strike : strike - spot;
                const intrinsic = Math.max(0, itm);
                const extrinsic = Math.max(5, 150 - Math.abs(i) * 25 + Math.random() * 30);
                const price     = +(intrinsic + extrinsic).toFixed(2);
                const prevPrice = +(price * (0.95 + Math.random() * 0.1)).toFixed(2);

                const volume  = Math.floor(avgVol * (0.6 + Math.random() * 1.8));
                const oi      = Math.floor(10000 + Math.random() * 80000);
                const prevOi  = Math.floor(oi * (0.88 + Math.random() * 0.24));
                const iv      = +(15 + Math.random() * 25 + Math.abs(i) * 1.5).toFixed(1);

                state.marketData.push({
                    id, symbol, strike, type,
                    expiry: 'WEEK1',
                    spot,
                    price, prevPrice,
                    volume, avgVol,
                    oi, prevOi,
                    iv
                });
            });
        }
    });
}

export async function initMarket() {
    await generateInitialData();
}
