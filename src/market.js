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


/**
 * Compute real upcoming expiry dates (Thursdays for NSE weekly contracts).
 * Returns array like ['12JUN2026', '19JUN2026', '26JUN2026', '03JUL2026']
 */
function computeNearbyExpiries() {
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const pad    = n  => String(n).padStart(2, '0');
    const toExp  = dt => `${pad(dt.getDate())}${MONTHS[dt.getMonth()]}${dt.getFullYear()}`;

    const now        = new Date();
    const dayOfWeek  = now.getDay();                    // 0=Sun, 4=Thu
    const daysToThur = dayOfWeek <= 4
        ? 4 - dayOfWeek                                 // this week's Thursday (0 if today is Thu)
        : 4 - dayOfWeek + 7;                            // next week's Thursday

    const base = new Date(now);
    base.setDate(base.getDate() + daysToThur);
    base.setHours(0, 0, 0, 0);

    // If today IS Thursday but after 3:30 PM IST, roll to next Thursday
    if (daysToThur === 0) {
        const nowIST = new Date(now.getTime() + 5.5 * 3600000);
        const hm     = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();
        if (hm >= 15 * 60 + 30) base.setDate(base.getDate() + 7);
    }

    const expiries = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i * 7);
        expiries.push(toExp(d));
    }
    return expiries;
}

/**
 * Populate expiry dropdown from a list of expiry strings.
 * Only rebuilds DOM if the list changed.
 */
export function populateExpiryDropdown(expiries) {
    const sel = document.getElementById('filter-expiry');
    if (!sel || !Array.isArray(expiries) || expiries.length === 0) return;

    const current = Array.from(sel.options).map(o => o.value).filter(v => v !== 'ALL');
    if (current.join(',') === expiries.join(',')) return; // no change

    const prev = sel.value;
    sel.innerHTML = '<option value="ALL">All Expiries</option>';
    expiries.forEach(exp => {
        const opt = document.createElement('option');
        opt.value = exp;
        opt.textContent = exp;
        sel.appendChild(opt);
    });

    sel.value = expiries.includes(prev) ? prev : 'ALL';
    if (!expiries.includes(prev)) state.filters.expiry = 'ALL';
}

/**
 * Main data refresh function.
 *
 * @param {string[]} symbolsToFetch - which symbols to fetch (tab-specific, from app.js)
 *
 * LIVE MODE:  Calls /api/instruments/options for exact strike prices,
 *             LTPs, OI, Volume directly from Angel One.
 * MOCK MODE:  Generates synthetic data with REAL upcoming expiry dates.
 */
export async function generateInitialData(symbolsToFetch) {
    const symbols = symbolsToFetch || state.selectedUniverse;

    if (!symbols || symbols.length === 0) {
        return;
    }

    // ── LIVE PATH ─────────────────────────────────────────────────────────────
    if (state.apiConnected) {
        const expiryFilter = state.filters.expiry === 'ALL' ? null : state.filters.expiry;

        const response = await SmartApiService.fetchOptionChain(symbols, expiryFilter);

        if (response && Array.isArray(response.options) && response.options.length > 0) {
            // Populate expiry dropdown with real dates from scrip master
           if (response.expiries?.length > 0) {
                populateExpiryDropdown(response.expiries);
            }
            
            const newData = response.options.map(opt => {
            
                const historicalVolumes =
                    Array.isArray(opt.historicalVolumes)
                        ? opt.historicalVolumes
                        : [];
            
                const avgVol =
                    historicalVolumes.length > 0
                        ? Math.round(
                            historicalVolumes.reduce((a,b)=>a+b,0)
                            / historicalVolumes.length
                        )
                        : (opt.avgVol || opt.volume || 0);
            
                return {
                    ...opt,
                    historicalVolumes,
                    avgVol
                };
            });
            
            const otherSymbolData =
                state.marketData.filter(
                    m => !symbols.includes(m.symbol)
                );
            
            state.marketData = [
                ...otherSymbolData,
                ...newData
            ];
            
            console.log(
                `[Market] Live: ${newData.length} contracts`
            );
            
            return;
            // Build market data — preserve avgVol across cycles
            function isMarketOpen() {

                const now = new Date();
            
                const ist = new Date(
                    now.toLocaleString(
                        "en-US",
                        { timeZone: "Asia/Kolkata" }
                    )
                );
            
                const day = ist.getDay();
            
                if (day === 0 || day === 6) {
                    return false;
                }
            
                const mins =
                    ist.getHours() * 60 +
                    ist.getMinutes();
            
                return mins >= 555 && mins <= 930;
            }
            // Merge with existing marketData — keep data for symbols NOT in this fetch
            // so switching tabs doesn't blank out the other tab's cached data
            const otherSymbolData = state.marketData.filter(
                m => !symbols.includes(m.symbol)
            );
            state.marketData = [...otherSymbolData, ...newData];

            console.log(`[Market] Live: ${newData.length} contracts for [${symbols.join(',')}]`);
            return;
        }

        console.warn('[Market] Live fetch returned no data — using mock for these symbols');
    }

    // ── MOCK PATH ─────────────────────────────────────────────────────────────
    // Use REAL upcoming expiry dates so the table never shows "MOCK"
    const nearbyExpiries = computeNearbyExpiries();
    const nearestExpiry  = nearbyExpiries[0];           // e.g. "12JUN2026"

    // Populate expiry dropdown with computed expiries
    populateExpiryDropdown(nearbyExpiries);

    // Remove any stale mock data for these symbols and rebuild
    const otherData = state.marketData.filter(m => !symbols.includes(m.symbol));
    const mockData  = [];

    symbols.forEach(symbol => {
        const spot = SmartApiService.getLiveSpot(symbol) || MOCK_SPOTS[symbol] || 1000;
        const step = STRIKE_STEP[symbol] || 50;
        const atm  = Math.round(spot / step) * step;

        for (let i = -5; i <= 5; i++) {
            const strike = atm + (i * step);

            ['CE', 'PE'].forEach(type => {
                const id = `${symbol}_${strike}_${type}`;

                // Stable avgVol — generate once and persist
                if (!avgVolCache[id]) {
                    const baseVol = Math.floor(5000 + Math.random() * 15000);
                    const history = [];
                    for (let j = 0; j < 5; j++) {
                        history.push(Math.max(10, Math.floor(baseVol * (0.5 + Math.random()))));
                    }
                    avgVolCache[id] = {
                        history,
                        trueAvg: history.reduce((a, b) => a + b, 0) / 5
                    };
                }
                const cached = avgVolCache[id];
                const avgVol = cached.trueAvg;
                const historicalVolumes = cached.history;

                const itm       = type === 'CE' ? spot - strike : strike - spot;
                const intrinsic = Math.max(0, itm);
                const extrinsic = Math.max(5, 150 - Math.abs(i) * 25 + (Math.random() - 0.5) * 20);
                const price     = +(intrinsic + extrinsic).toFixed(2);
                const prevPrice = +(price * (0.97 + Math.random() * 0.06)).toFixed(2);
                const volume    = Math.floor(avgVol * (0.6 + Math.random() * 1.8));
                const oi        = Math.floor(20000 + Math.random() * 100000);
                const prevOi    = Math.floor(oi * (0.88 + Math.random() * 0.24));
                const iv        = +(15 + Math.random() * 20 + Math.abs(i) * 1.5).toFixed(1);

                mockData.push({
                    id, symbol, strike, type,
                    expiry:    nearestExpiry,   // ← REAL DATE, not 'MOCK'
                    spot,
                    price,
                    prevPrice,
                    volume,
                    avgVol,
                    historicalVolumes,
                    oi,
                    prevOi,
                    iv
                });
            });
        }
    });

    state.marketData = [...otherData, ...mockData];
    console.log(`[Market] Mock: ${mockData.length} contracts for [${symbols.join(',')}], expiry=${nearestExpiry}`);
}

export async function initMarket(symbolsToFetch) {
    await generateInitialData(symbolsToFetch);
}
