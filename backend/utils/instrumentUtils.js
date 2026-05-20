/**
 * instrumentUtils.js
 * Downloads and caches the Angel One Scrip Master, providing fast O(1) lookups
 * for NFO/BFO option chain tokens, expiries, and normalized strike prices.
 */

const axios = require('axios');

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

// In-memory cache
let optionsCache = {};   // { underlying: { expiry: { strike: { CE: contract, PE: contract } } } }
let cashTokens   = {};   // { underlying: { exchange, tradingsymbol, symboltoken } }
let cacheLoaded  = false;
let cacheLoadedAt = null;
let totalOptionsIndexed = 0;

/**
 * Some app symbol names differ from Angel One scrip master names.
 * Map app symbol → scrip master `name` field.
 */
const SYMBOL_MAP = {
    'TATAMOTORS': 'TATAPOWER',     // TATAMOTORS not in current NFO; use closest available
    'M&MFIN':     'MFSL',          
    'MCDOWELL-N': 'UNITDSPR',      
    'PVRINOX':    'PVR',           
    'GMRINFRA':   'GMRAIRPORT',    
    'IPCALAB':    'IPCALAB',       
    'LTIM':       'LTIM',
    'LTTS':       'LTTS',
    'ACC':        'ACC',
    'BALKRISIND': 'BALKRISIND',
    'BALRAMCHIN': 'BALRAMCHIN',
    'SENSEX':     'SENSEX',
};

function resolveSymbol(appSymbol) {
    if (!appSymbol) return appSymbol;
    if (SYMBOL_MAP[appSymbol]) return SYMBOL_MAP[appSymbol];
    return appSymbol;
}

function normalizeStrike(rawStrike) {
    if (!rawStrike) return 0;
    const val = parseFloat(rawStrike);
    if (isNaN(val)) return 0;
    return Math.round((val / 100) * 100) / 100;
}

async function fetchAndCacheScripMaster() {
    try {
        console.log('[InstrumentUtils] Fetching Angel One scrip master...');
        const response = await axios.get(SCRIP_MASTER_URL, { timeout: 60000 });
        const data = response.data;

        if (!Array.isArray(data)) {
            throw new Error('Scrip master response is not an array');
        }

        console.log(`[InstrumentUtils] Downloaded ${data.length} instruments. Indexing...`);

        optionsCache = {};
        cashTokens = {};
        totalOptionsIndexed = 0;
        const underlyingSet = new Set();

        for (const item of data) {
            const { exch_seg, instrumenttype, name, expiry, strike, symbol, token, lotsize } = item;
            
            if (!name || !symbol || !token) continue;

            // 1. Index Cash Tokens for Live Spot Prices
            if ((exch_seg === 'NSE' || exch_seg === 'BSE') && (instrumenttype === 'EQ' || instrumenttype === 'AMXIDX')) {
                // Prefer NSE over BSE if both exist
                if (!cashTokens[name] || exch_seg === 'NSE') {
                    cashTokens[name] = { exchange: exch_seg, tradingsymbol: symbol, symboltoken: token };
                }
                // Special handling for indices which might not have 'EQ'
                continue;
            }
            if (exch_seg === 'NSE' && symbol === 'NIFTY') cashTokens['NIFTY'] = { exchange: 'NSE', tradingsymbol: 'NIFTY', symboltoken: '26000' };
            if (exch_seg === 'NSE' && symbol === 'BANKNIFTY') cashTokens['BANKNIFTY'] = { exchange: 'NSE', tradingsymbol: 'BANKNIFTY', symboltoken: '26009' };
            if (exch_seg === 'NSE' && symbol === 'FINNIFTY') cashTokens['FINNIFTY'] = { exchange: 'NSE', tradingsymbol: 'FINNIFTY', symboltoken: '26037' };
            if (exch_seg === 'NSE' && symbol === 'MIDCPNIFTY') cashTokens['MIDCPNIFTY'] = { exchange: 'NSE', tradingsymbol: 'MIDCPNIFTY', symboltoken: '26074' };
            if (exch_seg === 'BSE' && symbol === 'SENSEX') cashTokens['SENSEX'] = { exchange: 'BSE', tradingsymbol: 'SENSEX', symboltoken: '1' };

            // 2. Index Options
            if (exch_seg !== 'NFO' && exch_seg !== 'BFO') continue;
            if (instrumenttype !== 'OPTIDX' && instrumenttype !== 'OPTSTK') continue;
            if (!expiry || !strike) continue;

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
        console.log(`[InstrumentUtils] ✅ Indexed ${totalOptionsIndexed} options and ${Object.keys(cashTokens).length} cash tokens.`);
        
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

function getAllCashTokens() {
    return Object.values(cashTokens);
}

module.exports = {
    fetchAndCacheScripMaster,
    normalizeStrike,
    resolveSymbol,
    mapInstrumentToken,
    getAvailableExpiries,
    generateOptionChainMapping,
    getCacheStatus,
    getAllCashTokens,
};
