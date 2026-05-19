const axios = require('axios');

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

let scripMasterCache = [];
let optionsCache = {}; // Structured cache for O(1) lookups: { underlying: { expiry: { strike: { CE: token, PE: token } } } }

/**
 * Downloads and caches the Angel One Scrip Master JSON.
 */
async function fetchAndCacheScripMaster() {
    try {
        console.log(`[InstrumentUtils] Fetching scrip master from ${SCRIP_MASTER_URL}...`);
        const response = await axios.get(SCRIP_MASTER_URL);
        const data = response.data;
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid data format received for scrip master');
        }

        scripMasterCache = data;
        
        // Build optimized lookup cache for options
        optionsCache = {};
        let optionsCount = 0;
        
        data.forEach(item => {
            // We only care about NSE/NFO options
            if (item.exch_seg === 'NFO' || item.exch_seg === 'BFO') {
                if (item.instrumenttype === 'OPTIDX' || item.instrumenttype === 'OPTSTK') {
                    const underlying = item.name;
                    const expiry = item.expiry;
                    const rawStrike = item.strike;
                    const symbol = item.symbol;
                    
                    if (!underlying || !expiry || !rawStrike || !symbol) return;
                    
                    const strike = normalizeStrike(rawStrike);
                    const optionType = symbol.endsWith('CE') ? 'CE' : (symbol.endsWith('PE') ? 'PE' : null);
                    
                    if (!optionType) return;
                    
                    if (!optionsCache[underlying]) optionsCache[underlying] = {};
                    if (!optionsCache[underlying][expiry]) optionsCache[underlying][expiry] = {};
                    if (!optionsCache[underlying][expiry][strike]) optionsCache[underlying][expiry][strike] = {};
                    
                    optionsCache[underlying][expiry][strike][optionType] = {
                        token: item.token,
                        symbol: item.symbol,
                        lotsize: item.lotsize,
                        exch_seg: item.exch_seg
                    };
                    optionsCount++;
                }
            }
        });
        
        console.log(`[InstrumentUtils] Successfully cached ${data.length} total instruments. Indexed ${optionsCount} F&O options.`);
    } catch (error) {
        console.error(`[InstrumentUtils] Error fetching scrip master:`, error.message);
    }
}

/**
 * Normalizes the Angel One strike price.
 * Angel One provides strike multiplied by 100 (e.g. "2370000.000000" -> 23700).
 */
function normalizeStrike(rawStrike) {
    if (!rawStrike) return 0;
    const strikeValue = parseFloat(rawStrike);
    if (isNaN(strikeValue)) return 0;
    return strikeValue / 100;
}

/**
 * Parses an option symbol to extract underlying, expiry, strike, and type.
 * e.g. NIFTY24DEC2423700CE -> { underlying: 'NIFTY', optionType: 'CE', ... }
 */
function parseOptionSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
        console.warn(`[InstrumentUtils] Malformed symbol provided:`, symbol);
        return null;
    }
    
    // Fallback parser since actual Angel symbol formats can vary. 
    // It's safer to rely on the JSON object fields (`name`, `expiry`, `strike`) when available.
    const optionType = symbol.endsWith('CE') ? 'CE' : (symbol.endsWith('PE') ? 'PE' : null);
    if (!optionType) return null;
    
    // Very basic extraction for debug logging
    const baseMatch = symbol.match(/^([A-Z]+)(\d{2}[A-Z]{3}\d{2})(\d+)(CE|PE)$/);
    if (baseMatch) {
        return {
            underlying: baseMatch[1],
            expiryStr: baseMatch[2],
            strike: parseFloat(baseMatch[3]),
            optionType: baseMatch[4]
        };
    }
    return { symbol, optionType, status: 'complex_format' };
}

/**
 * Validates if an option contract object has all required fields.
 */
function validateContract(contract) {
    if (!contract) return { valid: false, reason: 'Null contract' };
    if (!contract.underlying) return { valid: false, reason: 'Missing underlying' };
    if (!contract.expiry) return { valid: false, reason: 'Missing expiry' };
    if (contract.strike === undefined || isNaN(parseFloat(contract.strike))) return { valid: false, reason: 'Missing/invalid strike' };
    if (contract.type !== 'CE' && contract.type !== 'PE') return { valid: false, reason: 'Invalid type (must be CE/PE)' };
    return { valid: true };
}

/**
 * Maps standard contract params to an Angel One token using the cache.
 */
function mapInstrumentToken(underlying, expiry, strike, type) {
    // Note: expiry formats from Angel One might be like "25JAN2024"
    if (!optionsCache[underlying]) {
        console.log(`[InstrumentUtils] Token map missed: Unknown underlying ${underlying}`);
        return null;
    }
    
    let targetExpiry = expiry;
    if (!targetExpiry) {
        // Just pick the first available expiry for the underlying
        targetExpiry = Object.keys(optionsCache[underlying])[0];
    } else {
        const expiries = Object.keys(optionsCache[underlying]);
        const matched = expiries.find(e => e.toUpperCase() === targetExpiry.toUpperCase());
        if (matched) {
            targetExpiry = matched;
        } else {
            console.log(`[InstrumentUtils] Token map missed: Expiry ${targetExpiry} not found for ${underlying}`);
            return null;
        }
    }
    
    if (!optionsCache[underlying][targetExpiry]) {
        return null;
    }
    
    const strikeData = optionsCache[underlying][targetExpiry][strike];
    if (!strikeData) {
        console.log(`[InstrumentUtils] Token map missed: Strike ${strike} not found for ${underlying} ${targetExpiry}`);
        return null;
    }
    
    const contract = strikeData[type];
    if (!contract) {
        console.log(`[InstrumentUtils] Token map missed: Type ${type} not found at strike ${strike}`);
        return null;
    }
    
    console.log(`[InstrumentUtils] Token mapped successfully: ${underlying} ${targetExpiry} ${strike} ${type} -> Token ${contract.token}`);
    return contract;
}

/**
 * Get available expiries for an underlying
 */
function getAvailableExpiries(underlying) {
    if (!optionsCache[underlying]) return [];
    
    // Sort expiries by date roughly
    return Object.keys(optionsCache[underlying]).sort((a, b) => {
        const da = new Date(a);
        const db = new Date(b);
        return da - db;
    });
}

/**
 * Generate an option chain for a given underlying, expiry and spot price.
 */
function generateOptionChainMapping(underlying, expiry, spotPrice, numStrikes = 10) {
    if (!optionsCache[underlying]) return { error: `Underlying ${underlying} not found` };
    
    let targetExpiry = expiry;
    const availableExpiries = getAvailableExpiries(underlying);
    
    if (!targetExpiry || !availableExpiries.includes(targetExpiry)) {
        if (availableExpiries.length === 0) return { error: `No expiries found for ${underlying}` };
        targetExpiry = availableExpiries[0]; // fallback to near expiry
    }
    
    const strikesObj = optionsCache[underlying][targetExpiry];
    const availableStrikes = Object.keys(strikesObj).map(Number).sort((a, b) => a - b);
    
    if (availableStrikes.length === 0) return { error: `No strikes found for ${underlying} ${targetExpiry}` };
    
    // Find ATM strike
    let atmStrike = availableStrikes[0];
    let minDiff = Math.abs(atmStrike - spotPrice);
    
    for (const strike of availableStrikes) {
        const diff = Math.abs(strike - spotPrice);
        if (diff < minDiff) {
            minDiff = diff;
            atmStrike = strike;
        }
    }
    
    const atmIndex = availableStrikes.indexOf(atmStrike);
    const startIndex = Math.max(0, atmIndex - numStrikes);
    const endIndex = Math.min(availableStrikes.length - 1, atmIndex + numStrikes);
    
    const selectedStrikes = availableStrikes.slice(startIndex, endIndex + 1);
    
    const chain = [];
    selectedStrikes.forEach(strike => {
        const data = strikesObj[strike];
        if (data.CE) {
            chain.push({
                symbol: data.CE.symbol,
                token: data.CE.token,
                underlying,
                expiry: targetExpiry,
                strike,
                type: 'CE',
                lotsize: data.CE.lotsize,
                exch_seg: data.CE.exch_seg
            });
        }
        if (data.PE) {
            chain.push({
                symbol: data.PE.symbol,
                token: data.PE.token,
                underlying,
                expiry: targetExpiry,
                strike,
                type: 'PE',
                lotsize: data.PE.lotsize,
                exch_seg: data.PE.exch_seg
            });
        }
    });
    
    return {
        expiry: targetExpiry,
        underlying,
        spotPrice,
        atmStrike,
        chain
    };
}

module.exports = {
    fetchAndCacheScripMaster,
    normalizeStrike,
    parseOptionSymbol,
    validateContract,
    mapInstrumentToken,
    getAvailableExpiries,
    generateOptionChainMapping
};
