/**
 * instrumentUtils.js — Angel One Scrip Master Cache
 * Provides O(1) option chain lookups, real token mapping, strike normalization,
 * expiry filtering, and symbol parsing for the Antigravity Options Scanner.
 */

const axios = require('axios');

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

// ─── In-Memory Cache ────────────────────────────────────────────────────────
let optionsCache      = {};   // { underlying: { expiry: { strike: { CE|PE: contract } } } }
let cashTokens        = {};   // { appSymbol: { exchange, tradingsymbol, symboltoken } }
let cacheLoaded       = false;
let cacheLoadedAt     = null;
let totalOptionsIndexed = 0;

// ─── Hardcoded Index Tokens (NSE/BSE indices are not in EQ segment) ─────────
const INDEX_TOKENS = {
    'NIFTY':      { exchange: 'NSE', tradingsymbol: 'NIFTY',      symboltoken: '26000' },
    'BANKNIFTY':  { exchange: 'NSE', tradingsymbol: 'BANKNIFTY',  symboltoken: '26009' },
    'FINNIFTY':   { exchange: 'NSE', tradingsymbol: 'FINNIFTY',   symboltoken: '26037' },
    'MIDCPNIFTY': { exchange: 'NSE', tradingsymbol: 'MIDCPNIFTY', symboltoken: '26074' },
    'SENSEX':     { exchange: 'BSE', tradingsymbol: 'SENSEX',     symboltoken: '1'     },
    'BANKEX':     { exchange: 'BSE', tradingsymbol: 'BANKEX',     symboltoken: '999901'},
    'NIFTYNXT50': { exchange: 'NSE', tradingsymbol: 'NIFTYNXT50', symboltoken: '26013' },
};

// ─── Symbol Map: App name → Scrip Master `name` field ───────────────────────
// Only entries where names differ are listed; all others pass through as-is.
const SYMBOL_MAP = {
    'TATAMOTORS': 'TMPV',         // Tata Motors in current NFO is listed as TMPV
    'M&MFIN':     'MFSL',
    'MCDOWELL-N': 'UNITDSPR',
    'PVRINOX':    'PVRINOX',      // Keep same — check scrip master
    'GMRINFRA':   'GMRAIRPORT',
};

// ─── Utility: Resolve app symbol to scrip master name ───────────────────────
function resolveSymbol(appSymbol) {
    if (!appSymbol) return appSymbol;
    return SYMBOL_MAP[appSymbol] || appSymbol;
}

// ─── Utility: Normalize Angel One raw strike (stored as strike × 100) ────────
// Verified: NIFTY25000CE → raw=2500000 → / 100 = 25000 ✓
//           EICHERMOT6300CE → raw=630000 → / 100 = 6300  ✓
//           IOC135CE → raw=13500 → / 100 = 135           ✓
function normalizeStrike(rawStrike) {
    if (rawStrike === null || rawStrike === undefined) return 0;
    const val = parseFloat(rawStrike);
    if (isNaN(val) || val <= 0) return 0;
    // Divide by 100 and round to avoid floating-point noise
    return parseFloat((val / 100).toFixed(2));
}

// ─── Utility: Parse option symbol into components ────────────────────────────
// Handles Angel One formats:
//   NIFTY25MAY2425000CE  → { underlying:'NIFTY', expiry:'25MAY2024', strike:25000, type:'CE' }
//   EICHERMOT29MAY266300CE → { underlying:'EICHERMOT', expiry:'29MAY2026', strike:6300, type:'CE' }
function parseOptionSymbol(symbol) {
    if (!symbol) return null;
    // Pattern: [UNDERLYING][DDMMMYY or DDMMMYYYY][STRIKE][CE|PE]
    const m = symbol.match(/^([A-Z&\-]+?)(\d{2}[A-Z]{3}\d{2,4})(\d+(?:\.\d+)?)(CE|PE)$/);
    if (!m) return null;
    let expiryRaw = m[2];
    // Normalize 2-digit year to 4-digit
    if (expiryRaw.length === 7) {
        const yr = parseInt(expiryRaw.slice(5));
        expiryRaw = expiryRaw.slice(0, 5) + (yr < 50 ? '20' : '19') + expiryRaw.slice(5);
    }
    return {
        underlying: m[1],
        expiry:     expiryRaw,
        strike:     parseFloat(m[3]),
        type:       m[4],
    };
}

// ─── Utility: Check if an expiry date is in the future ──────────────────────
function isExpiryFuture(expiryStr) {
    const MONTHS = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
    const m = expiryStr.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
    if (!m) return true; // keep if can't parse
    const expDate = new Date(parseInt(m[3]), MONTHS[m[2]] || 0, parseInt(m[1]));
    // Add 1 day grace period
    return expDate >= new Date(Date.now() - 86400000);
}

// ─── Utility: Sort expiries chronologically ──────────────────────────────────
function sortExpiries(expiries) {
    const MONTHS = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
    return expiries.sort((a, b) => {
        const parse = s => {
            const m = s.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
            if (!m) return new Date(0);
            return new Date(parseInt(m[3]), MONTHS[m[2]] || 0, parseInt(m[1]));
        };
        return parse(a) - parse(b);
    });
}

// ─── Main: Download and Index the Scrip Master ──────────────────────────────
async function fetchAndCacheScripMaster() {
    try {
        console.log('[InstrumentUtils] Fetching Angel One Scrip Master...');
        const t0 = Date.now();
        const response = await axios.get(SCRIP_MASTER_URL, { timeout: 60000 });
        const data = response.data;

        if (!Array.isArray(data)) throw new Error('Scrip master is not an array');
        console.log(`[InstrumentUtils] Downloaded ${data.length} instruments in ${Date.now()-t0}ms. Indexing...`);

        // Reset cache
        optionsCache = {};
        cashTokens   = { ...INDEX_TOKENS };  // Seed with hardcoded index tokens
        totalOptionsIndexed = 0;
        const underlyingSet = new Set();
        let skippedExpired = 0;

        for (const item of data) {
            const { exch_seg, instrumenttype, name, expiry, strike, symbol, token, lotsize } = item;
            if (!name || !symbol || !token) continue;

            // ── 1. Cash market tokens (NSE_CM / BSE equity) ──────────────
            if ((exch_seg === 'NSE' || exch_seg === 'BSE') &&
                (instrumenttype === 'EQ' || instrumenttype === 'AMXIDX' || instrumenttype === 'INDEX')) {
                
                const isExact = (symbol === name || symbol === `${name}-EQ`);
                const existing = cashTokens[name];
                let shouldUpdate = false;

                if (!existing) {
                    shouldUpdate = true;
                } else {
                    const existingIsExact = (existing.tradingsymbol === name || existing.tradingsymbol === `${name}-EQ`);
                    if (isExact && !existingIsExact) {
                        shouldUpdate = true;
                    } else if (isExact && existingIsExact && exch_seg === 'NSE' && existing.exchange === 'BSE') {
                        shouldUpdate = true; // Prefer NSE over BSE if both are exact
                    } else if (!isExact && !existingIsExact && exch_seg === 'NSE' && existing.exchange === 'BSE') {
                        shouldUpdate = true; // Prefer NSE over BSE
                    }
                }

                if (shouldUpdate) {
                    cashTokens[name] = { exchange: exch_seg, tradingsymbol: symbol, symboltoken: token };
                }
                continue;
            }

            // ── 2. F&O options only ───────────────────────────────────────
            if (exch_seg !== 'NFO' && exch_seg !== 'BFO') continue;
            if (instrumenttype !== 'OPTIDX' && instrumenttype !== 'OPTSTK') continue;
            if (!expiry || strike === undefined || strike === null) continue;

            // Skip past expiries
            if (!isExpiryFuture(expiry)) { skippedExpired++; continue; }

            const optionType = symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null;
            if (!optionType) continue;

            const normalizedStrike = normalizeStrike(strike);
            if (normalizedStrike <= 0) continue;

            underlyingSet.add(name);
            if (!optionsCache[name])                           optionsCache[name] = {};
            if (!optionsCache[name][expiry])                   optionsCache[name][expiry] = {};
            if (!optionsCache[name][expiry][normalizedStrike]) optionsCache[name][expiry][normalizedStrike] = {};

            optionsCache[name][expiry][normalizedStrike][optionType] = {
                token,
                symbol,
                lotsize: parseInt(lotsize) || 1,
                exch_seg,
                normalizedStrike,    // store for debug
                rawStrike: strike,   // store raw for verification
            };
            totalOptionsIndexed++;
        }

        cacheLoaded   = true;
        cacheLoadedAt = new Date().toISOString();
        const uCount  = underlyingSet.size;
        console.log(`[InstrumentUtils] ✅ Indexed ${totalOptionsIndexed} options across ${uCount} underlyings.`);
        console.log(`[InstrumentUtils]    Skipped ${skippedExpired} expired contracts.`);
        console.log(`[InstrumentUtils]    Cash tokens: ${Object.keys(cashTokens).length} (incl. ${Object.keys(INDEX_TOKENS).length} hardcoded indices)`);
        console.log(`[InstrumentUtils]    Underlyings: ${[...underlyingSet].sort().join(', ')}`);

    } catch (err) {
        console.error('[InstrumentUtils] ❌ Scrip master fetch failed:', err.message);
    }
}

// ─── Get sorted future expiries for a given underlying ──────────────────────
function getAvailableExpiries(underlying) {
    const resolved = resolveSymbol(underlying);
    const cache    = optionsCache[resolved] || optionsCache[underlying];
    if (!cache) return [];
    return sortExpiries(Object.keys(cache).filter(isExpiryFuture));
}

// ─── Generate Option Chain Mapping ──────────────────────────────────────────
function generateOptionChainMapping(underlying, expiry, spotPrice, numStrikes = 10) {
    const resolved        = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];

    if (!underlyingCache) {
        const msg = cacheLoaded
            ? `Underlying '${underlying}'${resolved !== underlying ? ` (tried: '${resolved}')` : ''} not in scrip master`
            : 'Scrip master not yet loaded — retry in a few seconds';
        return { error: msg };
    }

    const availableExpiries = getAvailableExpiries(resolved || underlying);
    if (!availableExpiries.length) return { error: `No active expiries for ${underlying}` };

    // Pick nearest expiry if none specified or specified not found
    let targetExpiry = expiry && availableExpiries.includes(expiry) ? expiry : availableExpiries[0];

    const strikesObj = underlyingCache[targetExpiry] || {};
    const allStrikes = Object.keys(strikesObj).map(Number).sort((a, b) => a - b);
    if (!allStrikes.length) return { error: `No strikes for ${underlying} ${targetExpiry}` };

    // ATM = closest strike to spot
    let atmStrike = allStrikes[0], minDiff = Math.abs(atmStrike - spotPrice);
    for (const s of allStrikes) {
        const d = Math.abs(s - spotPrice);
        if (d < minDiff) { minDiff = d; atmStrike = s; }
    }

    const atmIdx   = allStrikes.indexOf(atmStrike);
    const startIdx = Math.max(0, atmIdx - numStrikes);
    const endIdx   = Math.min(allStrikes.length - 1, atmIdx + numStrikes);
    const selected = allStrikes.slice(startIdx, endIdx + 1);

    const chain = [];
    for (const strike of selected) {
        const data = strikesObj[strike];
        for (const optType of ['CE', 'PE']) {
            if (!data[optType]) continue;
            const c = data[optType];
            chain.push({
                symbol:     c.symbol,
                token:      c.token,
                underlying,
                expiry:     targetExpiry,
                strike,
                type:       optType,
                lotsize:    c.lotsize,
                exch_seg:   c.exch_seg,
            });
            // Debug log for first few
            if (chain.length <= 4) {
                console.log(`[InstrumentUtils] Chain: ${underlying} ${targetExpiry} ${strike} ${optType} → token=${c.token} rawStrike=${c.rawStrike} normStrike=${c.normalizedStrike}`);
            }
        }
    }

    console.log(`[InstrumentUtils] Built chain: ${underlying} | expiry=${targetExpiry} | spot=${spotPrice} | ATM=${atmStrike} | contracts=${chain.length}`);

    return {
        underlying,
        resolvedAs:    resolved !== underlying ? resolved : undefined,
        expiry:        targetExpiry,
        allExpiries:   availableExpiries,
        spotPrice,
        atmStrike,
        strikeCount:   selected.length,
        chain,
    };
}

// ─── Map a single instrument to its token ────────────────────────────────────
function mapInstrumentToken(underlying, expiry, strike, type) {
    const resolved        = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];
    if (!underlyingCache) return null;

    const expiries     = Object.keys(underlyingCache);
    const targetExpiry = expiry
        ? (expiries.find(e => e.toUpperCase() === expiry.toUpperCase()) || null)
        : getAvailableExpiries(underlying)[0];
    if (!targetExpiry) return null;

    const contract = underlyingCache[targetExpiry]?.[strike]?.[type];
    if (contract) {
        console.log(`[InstrumentUtils] Token: ${underlying} ${targetExpiry} ${strike} ${type} → ${contract.token}`);
    }
    return contract || null;
}

// ─── Cache Status ────────────────────────────────────────────────────────────
function getCacheStatus() {
    return {
        loaded:             cacheLoaded,
        loadedAt:           cacheLoadedAt,
        totalOptionsIndexed,
        underlyingsCount:   Object.keys(optionsCache).length,
        cashTokensCount:    Object.keys(cashTokens).length,
        underlyings:        Object.keys(optionsCache).sort(),
    };
}

// ─── Cash Tokens ─────────────────────────────────────────────────────────────
function getAllCashTokens()      { return Object.values(cashTokens); }
function getCashToken(symbol)   { return cashTokens[resolveSymbol(symbol)] || cashTokens[symbol] || null; }

module.exports = {
    fetchAndCacheScripMaster,
    normalizeStrike,
    parseOptionSymbol,
    resolveSymbol,
    mapInstrumentToken,
    getAvailableExpiries,
    generateOptionChainMapping,
    getCacheStatus,
    getAllCashTokens,
    getCashToken,
    isExpiryFuture,
};
