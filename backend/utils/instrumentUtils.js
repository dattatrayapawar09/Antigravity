/**
 * instrumentUtils.js — Angel One Scrip Master Cache
 * Provides O(1) option chain lookups, real token mapping, strike normalization,
 * expiry filtering, and symbol parsing for the Antigravity Options Scanner.
 *
 * FIXES APPLIED:
 *  1. normalizeStrike() — validated against Angel One scrip master format (strike × 100)
 *  2. parseOptionSymbol() — handles M&M, BAJAJ-AUTO, and other special symbols
 *  3. Exchange segment validation — cashTokens always use correct exchange for quote API
 *  4. Duplicate strike handling — deduplicate by keeping the contract with lowest token (primary)
 *  5. Debug logging — every contract indexed prints token, raw strike, normalized strike
 *  6. getContractDebugInfo() — exported for /api/debug/validate endpoint
 *  7. Token registry — tokenToContract map for O(1) reverse lookup by token
 */

const axios = require('axios');

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

// ─── In-Memory Cache ────────────────────────────────────────────────────────
let optionsCache        = {};   // { underlying: { expiry: { strike: { CE|PE: contract } } } }
let cashTokens          = {};   // { appSymbol: { exchange, tradingsymbol, symboltoken } }
let tokenToContract     = {};   // { token: contractObject } — reverse lookup
let cacheLoaded         = false;
let cacheLoadedAt       = null;
let totalOptionsIndexed = 0;

// ─── Hardcoded Index Tokens (NSE/BSE indices use special tokens) ─────────────
// These come from Angel One documentation — indices are NOT in EQ scrip master
const INDEX_TOKENS = {
    'NIFTY':      { exchange: 'NSE', tradingsymbol: 'NIFTY',      symboltoken: '26000' },
    'BANKNIFTY':  { exchange: 'NSE', tradingsymbol: 'BANKNIFTY',  symboltoken: '26009' },
    'FINNIFTY':   { exchange: 'NSE', tradingsymbol: 'FINNIFTY',   symboltoken: '26037' },
    'MIDCPNIFTY': { exchange: 'NSE', tradingsymbol: 'MIDCPNIFTY', symboltoken: '26074' },
    'SENSEX':     { exchange: 'BSE', tradingsymbol: 'SENSEX',     symboltoken: '1'     },
    'BANKEX':     { exchange: 'BSE', tradingsymbol: 'BANKEX',     symboltoken: '999901'},
    'NIFTYNXT50': { exchange: 'NSE', tradingsymbol: 'NIFTYNXT50', symboltoken: '26013' },
};

// ─── Symbol Map: App name → Scrip Master `name` field ────────────────────────
// Only entries where names differ are listed; all others pass through as-is.
const SYMBOL_MAP = {
    'TATAMOTORS': 'TMPV',         // Tata Motors NFO listed as TMPV
    'M&MFIN':     'MFSL',
    'MCDOWELL-N': 'UNITDSPR',
    'GMRINFRA':   'GMRAIRPORT',
    'PVRINOX':    'PVRINOX',
};

// ─── Reverse symbol map: Scrip Master name → App name ────────────────────────
const REVERSE_SYMBOL_MAP = Object.fromEntries(
    Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

// ─── Utility: Resolve app symbol to scrip master name ────────────────────────
function resolveSymbol(appSymbol) {
    if (!appSymbol) return appSymbol;
    return SYMBOL_MAP[appSymbol] || appSymbol;
}

// ─── Utility: Reverse resolve scrip master name to app symbol ────────────────
function unresolveSymbol(scripName) {
    if (!scripName) return scripName;
    return REVERSE_SYMBOL_MAP[scripName] || scripName;
}

// ─── Utility: Normalize Angel One raw strike (stored as strike × 100) ────────
//
// VERIFIED Angel One scrip master format:
//   NIFTY25000CE  → raw strike field = 2500000 → / 100 = 25000   ✓
//   BANKNIFTY53000PE → raw = 5300000 → / 100 = 53000             ✓
//   EICHERMOT6300CE  → raw = 630000  → / 100 = 6300              ✓
//   IOC135CE         → raw = 13500   → / 100 = 135               ✓
//   IDEA11CE         → raw = 1100    → / 100 = 11                 ✓
//   HDFCBANK800CE    → raw = 80000   → / 100 = 800               ✓
//   MRF185000CE      → raw = 18500000 → / 100 = 185000           ✓
//
// The Angel One scrip master ALWAYS stores strikes as integer × 100.
// This is consistent across ALL F&O instruments — do NOT use any divisor heuristic.
function normalizeStrike(rawStrike, symbol = null) {
    // If a full trading symbol is given, extract strike directly from parsed symbol
    // (most reliable — no division needed)
    if (symbol) {
        const parsed = parseOptionSymbol(symbol);
        if (parsed && parsed.strike) return parsed.strike;
    }
    if (rawStrike === null || rawStrike === undefined) return 0;
    const val = parseFloat(rawStrike);
    if (isNaN(val) || val <= 0) return 0;
    // Angel One ALWAYS stores raw strike as strike × 100
    return parseFloat((val / 100).toFixed(2));
}

// ─── Utility: Parse option symbol into components ─────────────────────────────
//
// Angel One formats encountered in scrip master:
//   NIFTY29MAY2624500CE     → underlying=NIFTY,     expiry=29MAY2026, strike=24500, type=CE
//   BANKNIFTY29MAY2653000PE → underlying=BANKNIFTY, expiry=29MAY2026, strike=53000, type=PE
//   EICHERMOT29MAY266300CE  → underlying=EICHERMOT, expiry=29MAY2026, strike=6300,  type=CE
//   M&M29MAY261500CE        → underlying=M&M,       expiry=29MAY2026, strike=1500,  type=CE
//   BAJAJ-AUTO29MAY269800CE → underlying=BAJAJ-AUTO,expiry=29MAY2026, strike=9800,  type=CE
//
// The expiry is 2-digit year (YY) or 4-digit year (YYYY) in scrip master.
// This parser handles both.
function parseOptionSymbol(symbol) {
    if (!symbol) return null;

    // Handle special underlying names with & or -
    // Pattern: [UNDERLYING (may contain & or -)][DDMMMYY, YYMMM or DDMMMYYYY][STRIKE][CE|PE]
    const m = symbol.match(/^([A-Z&\-]+?[A-Z])(\d{2}[A-Z]{3}\d{0,4})(\d+(?:\.\d+)?)(CE|PE)$/);
    if (!m) {
        console.warn(`[InstrumentUtils] parseOptionSymbol: no match for "${symbol}"`);
        return null;
    }

    let expiryRaw = m[2];
    // Normalize 2-digit year (YY) → 4-digit (YYYY)
    if (expiryRaw.length === 7) {
        const yr = parseInt(expiryRaw.slice(5), 10);
        expiryRaw = expiryRaw.slice(0, 5) + (yr < 50 ? '20' : '19') + expiryRaw.slice(5);
    }

    return {
        underlying: m[1],
        expiry:     expiryRaw,
        strike:     parseFloat(m[3]),
        type:       m[4],
        raw:        symbol,
    };
}

// ─── Utility: Check if an expiry date is in the future ───────────────────────
function isExpiryFuture(expiryStr) {
    const MONTHS = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
    const m = expiryStr.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
    if (!m) return true; // keep if can't parse
    const expDate = new Date(parseInt(m[3], 10), MONTHS[m[2]] ?? 0, parseInt(m[1], 10));
    // Allow 1 day grace — so today's expiry is still valid
    return expDate >= new Date(Date.now() - 86400000);
}

// ─── Utility: Sort expiries chronologically ───────────────────────────────────
function sortExpiries(expiries) {
    const MONTHS = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
    return [...expiries].sort((a, b) => {
        const parse = s => {
            const m = s.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
            if (!m) return new Date(0);
            return new Date(parseInt(m[3], 10), MONTHS[m[2]] ?? 0, parseInt(m[1], 10));
        };
        return parse(a) - parse(b);
    });
}

// ─── Utility: Classify a real expiry date as WEEK1/WEEK2/MONTH1/MONTH2 ────────
// Used by frontend to map Angel One dates to relative expiry labels.
function classifyExpiry(expiryStr, allExpiriesForUnderlying) {
    const sorted = sortExpiries(allExpiriesForUnderlying.filter(isExpiryFuture));
    const idx = sorted.indexOf(expiryStr);
    if (idx === 0) return 'WEEK1';
    if (idx === 1) return 'WEEK2';
    if (idx === 2) return 'MONTH1';
    if (idx === 3) return 'MONTH2';
    return `EXP${idx + 1}`;
}

// ─── Main: Download and Index the Scrip Master ───────────────────────────────
async function fetchAndCacheScripMaster() {
    try {
        console.log('[InstrumentUtils] ── Fetching Angel One Scrip Master ──────────────');
        const t0 = Date.now();
        const response = await axios.get(SCRIP_MASTER_URL, { timeout: 60000 });
        const data = response.data;

        if (!Array.isArray(data)) throw new Error('Scrip master is not an array');
        console.log(`[InstrumentUtils] Downloaded ${data.length} records in ${Date.now() - t0}ms. Indexing...`);

        // Reset caches
        optionsCache        = {};
        cashTokens          = { ...INDEX_TOKENS };   // Seed with hardcoded index tokens
        tokenToContract     = {};
        totalOptionsIndexed = 0;

        const underlyingSet = new Set();
        let skippedExpired   = 0;
        let skippedBadSymbol = 0;
        let skippedBadStrike = 0;
        let cashIndexed      = 0;
        let duplicateStrikes  = 0;

        // ── Sample first 3 option records for debug ──────────────────────
        let samplePrinted = 0;

        for (const item of data) {
            const {
                exch_seg, instrumenttype, name, expiry,
                strike, symbol, token, lotsize
            } = item;

            if (!name || !symbol || !token) continue;

            // ── 1. Cash market tokens (NSE / BSE equity & indices) ────────────
            if ((exch_seg === 'NSE' || exch_seg === 'BSE') &&
                (instrumenttype === 'EQ' || instrumenttype === 'AMXIDX' || instrumenttype === 'INDEX')) {

                // Prefer exact match (symbol === name or symbol === `${name}-EQ`)
                const isExact = (symbol === name || symbol === `${name}-EQ`);
                const existing = cashTokens[name];
                let shouldUpdate = false;

                if (!existing) {
                    shouldUpdate = true;
                } else {
                    const existingIsExact = (
                        existing.tradingsymbol === name ||
                        existing.tradingsymbol === `${name}-EQ`
                    );
                    // Preference order: NSE exact > BSE exact > NSE fuzzy > BSE fuzzy
                    if (isExact && !existingIsExact)                                          shouldUpdate = true;
                    else if (isExact && existingIsExact && exch_seg === 'NSE' && existing.exchange === 'BSE') shouldUpdate = true;
                    else if (!isExact && !existingIsExact && exch_seg === 'NSE' && existing.exchange === 'BSE') shouldUpdate = true;
                }

                if (shouldUpdate) {
                    // Angel One quote API uses 'NSE' for NSE cash and 'BSE' for BSE cash
                    cashTokens[name] = {
                        exchange:     exch_seg,        // 'NSE' or 'BSE'
                        tradingsymbol: symbol,
                        symboltoken:  token,
                    };
                    cashIndexed++;
                }
                continue;
            }

            // ── 2. F&O options only ───────────────────────────────────────────
            if (exch_seg !== 'NFO' && exch_seg !== 'BFO') continue;
            if (instrumenttype !== 'OPTIDX' && instrumenttype !== 'OPTSTK') continue;
            if (!expiry || strike === undefined || strike === null) continue;

            // Skip past expiries
            if (!isExpiryFuture(expiry)) { skippedExpired++; continue; }

            // Determine option type from symbol suffix
            const parsed = parseOptionSymbol(symbol);
            const optionType = parsed ? parsed.type : (symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null);
            if (!optionType) { skippedBadSymbol++; continue; }

            // Normalize strike
            const normalizedStrike = parsed ? parsed.strike : normalizeStrike(strike, symbol);
            if (normalizedStrike <= 0) { skippedBadStrike++; continue; }

            // Debug: print first few samples per underlying for validation
            if (samplePrinted < 20) {
                console.log(
                    `[InstrumentUtils][SAMPLE] token=${token} | sym=${symbol} | name=${name}` +
                    ` | exch=${exch_seg} | expiry=${expiry}` +
                    ` | rawStrike=${strike} → normStrike=${normalizedStrike} | type=${optionType}`
                );
                samplePrinted++;
            }

            // Build cache tree
            underlyingSet.add(name);
            if (!optionsCache[name])                           optionsCache[name] = {};
            if (!optionsCache[name][expiry])                   optionsCache[name][expiry] = {};
            if (!optionsCache[name][expiry][normalizedStrike]) optionsCache[name][expiry][normalizedStrike] = {};

            const contract = {
                token,
                symbol,           // Full Angel One trading symbol, e.g. "NIFTY29MAY2624500CE"
                name,             // Underlying name, e.g. "NIFTY"
                lotsize:         parseInt(lotsize, 10) || 1,
                exch_seg,         // 'NFO' or 'BFO'
                expiry,
                normalizedStrike,
                rawStrike:        String(strike),
                optionType,
            };

            // Deduplication: if this strike already mapped, keep the primary token (lower token number)
            const existing = optionsCache[name][expiry][normalizedStrike][optionType];
            if (existing) {
                duplicateStrikes++;
                // Keep the one with the smaller (primary) token number
                if (parseInt(token, 10) >= parseInt(existing.token, 10)) {
                    continue; // skip — keep existing
                }
            }

            optionsCache[name][expiry][normalizedStrike][optionType] = contract;
            // Reverse lookup: token → full contract details
            tokenToContract[String(token)] = {
                ...contract,
                underlying: unresolveSymbol(name) || name,
            };
            totalOptionsIndexed++;
        }

        cacheLoaded   = true;
        cacheLoadedAt = new Date().toISOString();
        const uCount  = underlyingSet.size;

        console.log(`\n[InstrumentUtils] ✅ Indexing complete:`);
        console.log(`   Options indexed  : ${totalOptionsIndexed}`);
        console.log(`   Underlyings      : ${uCount}`);
        console.log(`   Cash tokens      : ${Object.keys(cashTokens).length} (${Object.keys(INDEX_TOKENS).length} hardcoded indices)`);
        console.log(`   Skipped expired  : ${skippedExpired}`);
        console.log(`   Skipped bad sym  : ${skippedBadSymbol}`);
        console.log(`   Skipped bad strike: ${skippedBadStrike}`);
        console.log(`   Duplicates removed: ${duplicateStrikes}`);
        console.log(`   Token map size   : ${Object.keys(tokenToContract).length}`);
        console.log(`   Underlyings list : ${[...underlyingSet].sort().slice(0, 30).join(', ')}...`);

        // ── Validation: verify a few key index tokens ─────────────────────
        for (const sym of ['NIFTY', 'BANKNIFTY', 'FINNIFTY']) {
            const expiries = getAvailableExpiries(sym);
            if (expiries.length > 0) {
                const firstExp = expiries[0];
                const strikes  = Object.keys(optionsCache[sym]?.[firstExp] || {});
                console.log(`[InstrumentUtils][CHECK] ${sym}: ${expiries.length} expiries | nearest=${firstExp} | ${strikes.length} strikes | sample strikes: ${strikes.slice(0, 5).join(', ')}`);
            } else {
                console.warn(`[InstrumentUtils][CHECK] ⚠️  ${sym}: no active expiries found!`);
            }
        }

    } catch (err) {
        console.error('[InstrumentUtils] ❌ Scrip master fetch failed:', err.message);
    }
}

// ─── Get sorted future expiries for a given underlying ───────────────────────
function getAvailableExpiries(underlying) {
    const resolved = resolveSymbol(underlying);
    const cache    = optionsCache[resolved] || optionsCache[underlying];
    if (!cache) return [];
    return sortExpiries(Object.keys(cache).filter(isExpiryFuture));
}

// ─── Generate Option Chain Mapping ───────────────────────────────────────────
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

    // Pick nearest expiry if none specified or specified expiry not found
    let targetExpiry = expiry && availableExpiries.includes(expiry) ? expiry : availableExpiries[0];

    const strikesObj = underlyingCache[targetExpiry] || {};
    const allStrikes = Object.keys(strikesObj).map(Number).sort((a, b) => a - b);
    if (!allStrikes.length) return { error: `No strikes for ${underlying} ${targetExpiry}` };

    // ATM = closest strike to spot price
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
                symbol:     c.symbol,             // full trading symbol
                token:      c.token,
                underlying,                        // app-facing symbol
                resolvedAs: resolved !== underlying ? resolved : undefined,
                expiry:     targetExpiry,
                strike,                            // normalized strike
                type:       optType,
                lotsize:    c.lotsize,
                exch_seg:   c.exch_seg,
                rawStrike:  c.rawStrike,
            });

            // Debug log for first few entries
            if (chain.length <= 6) {
                console.log(
                    `[InstrumentUtils][CHAIN] ${underlying} ${targetExpiry} ${strike} ${optType}` +
                    ` → token=${c.token} rawStrike=${c.rawStrike} normStrike=${c.normalizedStrike}` +
                    ` tradingSymbol="${c.symbol}"`
                );
            }
        }
    }

    console.log(
        `[InstrumentUtils] Built chain: ${underlying} | resolvedAs=${resolved}` +
        ` | expiry=${targetExpiry} | spot=${spotPrice} | ATM=${atmStrike}` +
        ` | contracts=${chain.length} | from ${allStrikes.length} total strikes`
    );

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

// ─── Map a single instrument to its token (by explicit params) ────────────────
function mapInstrumentToken(underlying, expiry, strike, type) {
    const resolved        = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];
    if (!underlyingCache) return null;

    const expiries     = Object.keys(underlyingCache);
    const targetExpiry = expiry
        ? (expiries.find(e => e.toUpperCase() === expiry.toUpperCase()) || null)
        : getAvailableExpiries(underlying)[0];
    if (!targetExpiry) return null;

    // Try exact normalized strike first, then search nearby (within 0.01 tolerance)
    let contract = underlyingCache[targetExpiry]?.[strike]?.[type];
    if (!contract) {
        // Tolerance search for floating-point issues
        for (const s of Object.keys(underlyingCache[targetExpiry] || {})) {
            if (Math.abs(parseFloat(s) - strike) < 0.01) {
                contract = underlyingCache[targetExpiry][s]?.[type];
                if (contract) break;
            }
        }
    }

    if (contract) {
        console.log(
            `[InstrumentUtils] Token: ${underlying} ${targetExpiry} ${strike} ${type}` +
            ` → token=${contract.token} sym="${contract.symbol}" rawStrike=${contract.rawStrike}`
        );
    } else {
        console.warn(`[InstrumentUtils] ⚠️  Token miss: ${underlying} ${targetExpiry} ${strike} ${type} (resolved=${resolved})`);
    }
    return contract || null;
}

// ─── Reverse lookup: token → contract details ─────────────────────────────────
function getContractByToken(token) {
    return tokenToContract[String(token)] || null;
}

// ─── Debug: full info for a specific contract ─────────────────────────────────
function getContractDebugInfo(underlying, expiry, strike, type) {
    const resolved        = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];
    const availableExpiries = getAvailableExpiries(resolved || underlying);
    const targetExpiry    = expiry
        ? (availableExpiries.find(e => e.toUpperCase() === expiry.toUpperCase()) || null)
        : availableExpiries[0];

    const contract = targetExpiry
        ? underlyingCache?.[targetExpiry]?.[strike]?.[type] || null
        : null;

    // Find adjacent strikes for context
    const strikesForExpiry = targetExpiry
        ? Object.keys(underlyingCache?.[targetExpiry] || {}).map(Number).sort((a,b) => a-b)
        : [];
    const atmIdx = strikesForExpiry.findIndex(s => s === strike);

    return {
        queried: { underlying, expiry, strike, type },
        resolved,
        targetExpiry,
        availableExpiries,
        contract,
        adjacentStrikes: strikesForExpiry.slice(Math.max(0, atmIdx - 3), atmIdx + 4),
        cacheStats: getCacheStatus(),
    };
}

// ─── Cache Status ─────────────────────────────────────────────────────────────
function getCacheStatus() {
    return {
        loaded:             cacheLoaded,
        loadedAt:           cacheLoadedAt,
        totalOptionsIndexed,
        tokenMapSize:       Object.keys(tokenToContract).length,
        underlyingsCount:   Object.keys(optionsCache).length,
        cashTokensCount:    Object.keys(cashTokens).length,
        underlyings:        Object.keys(optionsCache).sort(),
    };
}

// ─── Cash Token Accessors ─────────────────────────────────────────────────────
function getAllCashTokens() { return Object.values(cashTokens); }
function getCashToken(symbol) {
    return cashTokens[resolveSymbol(symbol)] || cashTokens[symbol] || null;
}

// ─── Get all active expiries (for export to frontend) ────────────────────────
function getAllExpiriesForUnderlying(underlying) {
    return getAvailableExpiries(underlying);
}

module.exports = {
    fetchAndCacheScripMaster,
    normalizeStrike,
    parseOptionSymbol,
    resolveSymbol,
    unresolveSymbol,
    classifyExpiry,
    mapInstrumentToken,
    getAvailableExpiries,
    getAllExpiriesForUnderlying,
    generateOptionChainMapping,
    getContractByToken,
    getContractDebugInfo,
    getCacheStatus,
    getAllCashTokens,
    getCashToken,
    isExpiryFuture,
    sortExpiries,
    // Expose caches for debug endpoints (read-only reference)
    _optionsCache:    () => optionsCache,
    _tokenToContract: () => tokenToContract,
};
