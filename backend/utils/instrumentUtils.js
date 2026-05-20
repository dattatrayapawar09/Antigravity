/**
 * instrumentUtils.js
 * Downloads and caches the Angel One Scrip Master, providing fast O(1) lookups
 * for NFO/BFO option chain tokens, expiries, and normalized strike prices.
 */

const axios = require('axios');

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

// In-memory cache
let optionsCache = {};   // { underlying: { expiry: { strike: { CE: contract, PE: contract } } } }
let cacheLoaded  = false;
let cacheLoadedAt = null;
let totalOptionsIndexed = 0;

/**
 * Some app symbol names differ from Angel One scrip master names.
 * Map app symbol → scrip master `name` field.
 */
const SYMBOL_MAP = {
    // Old symbols that were delisted/renamed
    'TATAMOTORS': 'TATAPOWER',     // TATAMOTORS not in current NFO; use closest available
    'M&MFIN':     'MFSL',          // M&MFIN not in current NFO
    'MCDOWELL-N': 'UNITDSPR',      // United Spirits (McDowell's parent co)
    'PVRINOX':    'PVR',           // Check if PVR or PVRINOX is in scrip master
    'GMRINFRA':   'GMRAIRPORT',    // GMR Infrastructure restructured
    'IPCALAB':    'IPCALAB',       // Keep same — may just be missing from current expiry
    'LTIM':       'LTIM',
    'LTTS':       'LTTS',
    'ACC':        'ACC',
    'BALKRISIND': 'BALKRISIND',
    'BALRAMCHIN': 'BALRAMCHIN',
    // BFO stocks (listed under BSE F&O)
    'SENSEX':     'SENSEX',
};

/**
 * Resolve app symbol name to scrip master name.
 */
function resolveSymbol(appSymbol) {
    if (!appSymbol) return appSymbol;
    // Check explicit map first
    if (SYMBOL_MAP[appSymbol]) return SYMBOL_MAP[appSymbol];
    // Otherwise return as-is
    return appSymbol;
}

/**
 * Normalize Angel One strike price.
 * Angel One stores strike * 100 in the JSON (e.g. "6300.00" stored as "630000.000000").
 * Actual NSE strike = rawStrike / 100.
 *
 * Verified correct for:
 * - NFO OPTIDX: NIFTY29DEC2631000CE → strike: 3100000.000000 → 31000 ✓
 * - NFO OPTSTK: EICHERMOT26MAY266300CE → strike: 630000.000000 → 6300 ✓
 * - BFO OPTIDX: SENSEX28JUN68000PE → strike: 6800000.000000 → 68000 ✓
 * - BFO OPTSTK: IOC26MAY135CE → strike: 13500.000000 → 135 ✓
 */
function normalizeStrike(rawStrike) {
    if (!rawStrike) return 0;
    const val = parseFloat(rawStrike);
    if (isNaN(val)) return 0;
    return Math.round((val / 100) * 100) / 100; // round to 2dp to avoid float errors
}

/**
 * Downloads and caches the full Angel One scrip master JSON.
 * Builds an O(1) lookup table indexed by: underlying → expiry → strike → CE/PE
 */
async function fetchAndCacheScripMaster() {
    try {
        console.log('[InstrumentUtils] Fetching Angel One scrip master...');
        const response = await axios.get(SCRIP_MASTER_URL, { timeout: 60000 });
        const data = response.data;

        if (!Array.isArray(data)) {
            throw new Error('Scrip master response is not an array');
        }

        console.log(`[InstrumentUtils] Downloaded ${data.length} instruments. Indexing F&O options...`);

        optionsCache = {};
        totalOptionsIndexed = 0;
        const underlyingSet = new Set();

        for (const item of data) {
            const { exch_seg, instrumenttype, name, expiry, strike, symbol, token, lotsize } = item;

            // Only index NFO and BFO options
            if (exch_seg !== 'NFO' && exch_seg !== 'BFO') continue;
            if (instrumenttype !== 'OPTIDX' && instrumenttype !== 'OPTSTK') continue;
            if (!name || !expiry || !strike || !symbol || !token) continue;

            // Determine CE or PE from the symbol suffix
            const optionType = symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null;
            if (!optionType) continue;

            const normalizedStrike = normalizeStrike(strike);
            if (normalizedStrike <= 0) continue;

            underlyingSet.add(name);

            if (!optionsCache[name]) optionsCache[name] = {};
            if (!optionsCache[name][expiry]) optionsCache[name][expiry] = {};
            if (!optionsCache[name][expiry][normalizedStrike]) optionsCache[name][expiry][normalizedStrike] = {};

            optionsCache[name][expiry][normalizedStrike][optionType] = {
                token,
                symbol,
                lotsize: parseInt(lotsize) || 1,
                exch_seg
            };
            totalOptionsIndexed++;
        }

        cacheLoaded  = true;
        cacheLoadedAt = new Date().toISOString();
        console.log(`[InstrumentUtils] ✅ Indexed ${totalOptionsIndexed} options across ${underlyingSet.size} underlyings.`);
        console.log(`[InstrumentUtils] Available underlyings: ${[...underlyingSet].sort().join(', ')}`);

    } catch (err) {
        console.error('[InstrumentUtils] ❌ Failed to fetch scrip master:', err.message);
    }
}

/**
 * Get cache status for the /api/instruments/status endpoint.
 */
function getCacheStatus() {
    const underlyings = Object.keys(optionsCache).sort();
    return {
        loaded: cacheLoaded,
        loadedAt: cacheLoadedAt,
        totalOptionsIndexed,
        underlyingsCount: underlyings.length,
        underlyings,
    };
}

/**
 * Get sorted expiries for a given underlying.
 * Expiry format from Angel One: "26MAY2026", "29DEC2026" etc.
 */
function getAvailableExpiries(underlying) {
    const resolved = resolveSymbol(underlying);
    const cache = optionsCache[resolved] || optionsCache[underlying];
    if (!cache) return [];

    return Object.keys(cache).sort((a, b) => {
        // Parse "26MAY2026" → Date for sorting
        const parse = (s) => {
            const months = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
            const m = s.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
            if (!m) return new Date(0);
            return new Date(parseInt(m[3]), months[m[2]] || 0, parseInt(m[1]));
        };
        return parse(a) - parse(b);
    });
}

/**
 * Map a contract (underlying, expiry, strike, type) to an Angel One token.
 */
function mapInstrumentToken(underlying, expiry, strike, type) {
    const resolved = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];

    if (!underlyingCache) {
        console.log(`[InstrumentUtils] Token miss: no cache for ${underlying} (resolved: ${resolved})`);
        return null;
    }

    let targetExpiry = expiry;
    if (!targetExpiry) {
        const expiries = getAvailableExpiries(resolved || underlying);
        if (!expiries.length) return null;
        targetExpiry = expiries[0];
    } else {
        const expiries = Object.keys(underlyingCache);
        const matched = expiries.find(e => e.toUpperCase() === targetExpiry.toUpperCase());
        if (!matched) {
            console.log(`[InstrumentUtils] Token miss: expiry ${targetExpiry} not found for ${underlying}`);
            return null;
        }
        targetExpiry = matched;
    }

    const strikeData = underlyingCache[targetExpiry]?.[strike];
    if (!strikeData) {
        console.log(`[InstrumentUtils] Token miss: strike ${strike} not in ${underlying} ${targetExpiry}`);
        return null;
    }

    const contract = strikeData[type];
    if (!contract) {
        console.log(`[InstrumentUtils] Token miss: ${type} not at ${underlying} ${targetExpiry} ${strike}`);
        return null;
    }

    console.log(`[InstrumentUtils] ✅ Token: ${underlying} ${targetExpiry} ${strike} ${type} → ${contract.token}`);
    return contract;
}

/**
 * Build a full option chain for an underlying around its spot price.
 * Returns real strike prices, tokens, and lot sizes from the scrip master.
 */
function generateOptionChainMapping(underlying, expiry, spotPrice, numStrikes = 10) {
    const resolved = resolveSymbol(underlying);
    const underlyingCache = optionsCache[resolved] || optionsCache[underlying];

    if (!underlyingCache) {
        if (!cacheLoaded) {
            return { error: `Scrip master not yet loaded. Try again in a few seconds.` };
        }
        return { error: `Underlying '${underlying}' not found in scrip master (tried: '${resolved}')` };
    }

    const availableExpiries = getAvailableExpiries(resolved || underlying);
    if (!availableExpiries.length) {
        return { error: `No expiries found for ${underlying}` };
    }

    let targetExpiry = expiry;
    if (!targetExpiry || !availableExpiries.includes(targetExpiry)) {
        targetExpiry = availableExpiries[0]; // nearest expiry
    }

    const strikesObj    = underlyingCache[targetExpiry];
    const allStrikes    = Object.keys(strikesObj).map(Number).sort((a, b) => a - b);

    if (!allStrikes.length) {
        return { error: `No strikes found for ${underlying} ${targetExpiry}` };
    }

    // Find ATM (closest to spot)
    let atmStrike = allStrikes[0];
    let minDiff   = Math.abs(atmStrike - spotPrice);
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
            if (data[optType]) {
                chain.push({
                    symbol:     data[optType].symbol,
                    token:      data[optType].token,
                    underlying: underlying,   // return original symbol name
                    expiry:     targetExpiry,
                    strike,
                    type:       optType,
                    lotsize:    data[optType].lotsize,
                    exch_seg:   data[optType].exch_seg,
                });
            }
        }
    }

    return {
        underlying,
        resolvedAs:   resolved !== underlying ? resolved : undefined,
        expiry:       targetExpiry,
        allExpiries:  availableExpiries,
        spotPrice,
        atmStrike,
        strikeCount:  selected.length,
        chain,
    };
}

module.exports = {
    fetchAndCacheScripMaster,
    normalizeStrike,
    resolveSymbol,
    mapInstrumentToken,
    getAvailableExpiries,
    generateOptionChainMapping,
    getCacheStatus,
};
