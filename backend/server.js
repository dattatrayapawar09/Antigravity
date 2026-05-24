/**
 * AntiGravity — Angel One SmartAPI Proxy Backend
 * Provides auth, spot prices, option chain mapping, live quote APIs, and debug endpoints.
 *
 * FIXES APPLIED:
 *  1. batchQuote() — stores result keyed by BOTH camelCase and lowercase token for safe lookup
 *  2. /api/instruments/spot — token key lookup made case-insensitive + debug logging
 *  3. /api/market/option-ltp — validates exchange segment (NFO only for options)
 *  4. /api/debug/validate — new endpoint: prints full contract info vs live Angel One data
 *  5. /api/debug/spot — new endpoint: validates spot price for a symbol
 *  6. /api/debug/scrip — new endpoint: dumps indexed scrip data for an underlying
 *  7. /api/debug/token-map — new endpoint: dumps token → contract reverse map (paginated)
 *  8. All routes now log token, symbol, normalized strike, raw strike, LTP, spot
 *
 * Run: node server.js   (from /backend directory)
 */

const path         = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
if (dotenvResult.error) {
    console.error('[Env] dotenv error:', dotenvResult.error.message);
} else {
    console.log('[Env] Loaded:', path.join(__dirname, '.env'));
}

const apiKey   = process.env.ANGEL_API_KEY     || '';
const clientId = process.env.ANGEL_CLIENT_ID   || process.env.ANGEL_CLIENT_CODE || '';
const password = process.env.ANGEL_PASSWORD    || '';
const totpSec  = process.env.ANGEL_TOTP_SECRET || '';
const PORT     = parseInt(process.env.PORT, 10) || 3001;

console.log('[Env] ANGEL_API_KEY     :', apiKey    ? `${apiKey.slice(0,4)}****`    : 'MISSING ⚠️');
console.log('[Env] ANGEL_CLIENT_ID   :', clientId  ? clientId                      : 'MISSING ⚠️');
console.log('[Env] ANGEL_PASSWORD    :', password  ? '****'                         : 'MISSING ⚠️');
console.log('[Env] ANGEL_TOTP_SECRET :', totpSec   ? `${totpSec.slice(0,4)}****`   : 'MISSING ⚠️');

const express         = require('express');
const cors            = require('cors');
const SmartAPI        = require('./smartapi');
const instrumentUtils = require('./utils/instrumentUtils');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const client = new SmartAPI({ apiKey, clientId, password, totpSecret: totpSec });

// ─── Auto-login ───────────────────────────────────────────────────────────────
async function autoLogin() {
    const result = await client.login();
    if (result.success) {
        console.log('[Server] ✅ SmartAPI authenticated — LIVE MODE active');
    } else {
        console.warn(`[Server] ⚠️  SmartAPI auth failed (${result.reason}) — MOCK MODE`);
    }
}

// ─── Helper: Normalize token string for safe map lookup ──────────────────────
// Angel One's quote API returns "symbolToken" (capital T), but internally
// we may receive strings or numbers. Always store and look up as trimmed strings.
function tokenKey(t) {
    return String(t ?? '').trim();
}

// ─── Helper: Batch Quote Fetch ────────────────────────────────────────────────
// SmartAPI allows max 50 tokens per call. Groups instruments by exchange.
// FIX: stores results keyed by BOTH q.symbolToken AND q.symboltoken so that
//      downstream lookups succeed regardless of casing.
async function batchQuote(instruments, mode = 'LTP') {
    const BATCH = 50;
    const results = {};

    for (let i = 0; i < instruments.length; i += BATCH) {
        const batch = instruments.slice(i, i + BATCH);
        try {
            const data = await client.getQuote(batch, mode);
            if (!data) {
                console.warn('[Server] batchQuote: null response from getQuote');
                continue;
            }
            const fetched = data.fetched || [];

            if (i === 0 && fetched.length > 0) {
                console.log(`[Server] batchQuote response fields: ${JSON.stringify(Object.keys(fetched[0]))}`);
            }

            fetched.forEach(q => {
                // Angel One returns symbolToken (capital T) in market quote response
                // Store under all known key variants to prevent case-mismatch misses
                const tok = tokenKey(q.symbolToken ?? q.symboltoken ?? q.token);
                if (tok) {
                    results[tok] = q;
                    // Also store under lowercase variant
                    results[tok.toLowerCase()] = q;
                }
            });

            console.log(`[Server] batchQuote batch ${Math.floor(i / BATCH) + 1}: ${fetched.length} filled of ${batch.length} requested`);
        } catch (e) {
            console.error('[Server] batchQuote error:', e.message);
        }
    }
    return results;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({
        status:    'ok',
        timestamp: new Date().toISOString(),
        mode:      client.isTokenValid() ? 'LIVE' : 'MOCK',
    });
});

app.get('/api/auth/status', (req, res) => {
    const connected = client.isTokenValid();
    res.json({ connected, mode: connected ? 'LIVE' : 'MOCK', clientId: connected ? clientId : null });
});

app.post('/api/auth/login', async (req, res) => {
    const result = await client.login();
    res.json({
        success:   result.success,
        connected: client.isTokenValid(),
        mode:      client.isTokenValid() ? 'LIVE' : 'MOCK',
        reason:    result.reason || null,
    });
});

// ─── Raw market quote (pass-through) ─────────────────────────────────────────
app.post('/api/market/quote', async (req, res) => {
    const { instruments = [], mode = 'FULL' } = req.body;
    if (!client.isTokenValid()) return res.json({ connected: false, data: null });
    if (!instruments.length)   return res.status(400).json({ error: 'instruments array required' });
    const data = await client.getQuote(instruments, mode);
    res.json({ connected: true, data });
});

// ─── Option chain (Angel One native API) ─────────────────────────────────────
app.post('/api/market/optionchain', async (req, res) => {
    const { symbol, expiryDate, strikePrice } = req.body;
    if (!client.isTokenValid()) return res.json({ connected: false, data: null });
    const data = await client.getOptionChain(symbol, expiryDate, strikePrice);
    res.json({ connected: true, data });
});

// ─── Instrument Status ────────────────────────────────────────────────────────
app.get('/api/instruments/status', (req, res) => {
    res.json(instrumentUtils.getCacheStatus());
});

// ─── Option chain mapping (from Scrip Master cache) ──────────────────────────
app.get('/api/instruments/options', (req, res) => {
    const { symbol, expiry, spotPrice, numStrikes } = req.query;
    if (!symbol)    return res.status(400).json({ error: 'symbol required' });
    if (!spotPrice) return res.status(400).json({ error: 'spotPrice required' });
    const mapping = instrumentUtils.generateOptionChainMapping(
        symbol, expiry, parseFloat(spotPrice), numStrikes ? parseInt(numStrikes, 10) : 10
    );
    if (mapping.error) return res.status(404).json(mapping);
    res.json(mapping);
});

// ─── Bulk option chains ───────────────────────────────────────────────────────
app.post('/api/instruments/bulk-options', (req, res) => {
    const { requests, numStrikes } = req.body;
    if (!Array.isArray(requests)) return res.status(400).json({ error: 'requests array required' });
    const results = {};
    for (const r of requests) {
        if (!r.symbol || !r.spotPrice) continue;
        results[r.symbol] = instrumentUtils.generateOptionChainMapping(
            r.symbol, r.expiry, parseFloat(r.spotPrice), numStrikes ? parseInt(numStrikes, 10) : 10
        );
    }
    res.json(results);
});

// ─── Live Spot Prices ─────────────────────────────────────────────────────────
// POST /api/instruments/spot
// Body: { symbols: ['NIFTY','BANKNIFTY','RELIANCE'] }
// Returns: { connected, spotPrices: { NIFTY: 24500, BANKNIFTY: 53000, ... } }
//
// FIX: token key lookup is now case-insensitive (uses tokenKey() helper)
// FIX: detailed per-instrument debug logging comparing expected token vs response
app.post('/api/instruments/spot', async (req, res) => {
    const { symbols = [] } = req.body;
    if (!symbols.length) return res.status(400).json({ error: 'symbols array required' });

    const spotPrices = {};

    if (!client.isTokenValid()) {
        console.log('[Server] /spot — not connected, returning empty');
        return res.json({ connected: false, spotPrices });
    }

    // Build instrument list from scrip master cash tokens
    const instruments = [];
    for (const sym of symbols) {
        const tok = instrumentUtils.getCashToken(sym);
        if (tok) {
            let exch = tok.exchange;
            // Spot prices must be fetched from NSE_CM per requirements
            if (exch === 'NSE') exch = 'NSE_CM';
            instruments.push({ ...tok, exchange: exch, _appSym: sym });
            console.log(`[Server] /spot — ${sym} → exchange=${exch} tradingsym=${tok.tradingsymbol} token=${tok.symboltoken}`);
        } else {
            console.warn(`[Server] /spot — ⚠️  no cash token for: ${sym} (not in scrip master)`);
        }
    }

    if (!instruments.length) {
        console.warn('[Server] /spot — no instruments resolved, returning empty');
        return res.json({ connected: true, spotPrices });
    }

    console.log(`[Server] /spot — fetching LTP for ${instruments.length}/${symbols.length} symbols`);
    const quoteMap = await batchQuote(instruments, 'LTP');
    console.log(`[Server] /spot — quoteMap has ${Object.keys(quoteMap).length / 2} unique entries`);

    for (const instr of instruments) {
        const lookupKey = tokenKey(instr.symboltoken);
        const q = quoteMap[lookupKey] || quoteMap[lookupKey.toLowerCase()];

        if (q && (q.ltp !== undefined && q.ltp !== null)) {
            const ltp = parseFloat(q.ltp);
            if (!isNaN(ltp) && ltp > 0) {
                spotPrices[instr._appSym] = ltp;
                console.log(
                    `[Server] ✅ Spot: ${instr._appSym} (${instr.exchange}:${instr.tradingsymbol}` +
                    ` token=${instr.symboltoken}) = ₹${ltp}`
                );
            } else {
                console.warn(`[Server] ⚠️  Spot: ${instr._appSym} token=${instr.symboltoken} — ltp=${q.ltp} (zero/invalid)`);
            }
        } else {
            console.warn(
                `[Server] ⚠️  Spot miss: ${instr._appSym} token=${instr.symboltoken}` +
                ` — key "${lookupKey}" not in quoteMap. ` +
                `Available keys (first 5): ${Object.keys(quoteMap).slice(0, 5).join(', ')}`
            );
        }
    }

    console.log(`[Server] /spot — returned ${Object.keys(spotPrices).length}/${symbols.length} prices`);
    res.json({ connected: true, spotPrices });
});

// ─── Live Option LTP / OI / Volume ───────────────────────────────────────────
// POST /api/market/option-ltp
// Body: { contracts: [{token, exchange, tradingsymbol, underlying, strike, type, expiry}] }
// Returns: { connected, quotes: { token: {ltp, oi, volume, closePrice, netChange, pctChange} } }
//
// FIX: validates that option contracts use NFO/BFO exchange segment, not NSE/BSE
// FIX: detailed debug logging per contract
app.post('/api/market/option-ltp', async (req, res) => {
    const { contracts = [] } = req.body;
    if (!contracts.length) return res.status(400).json({ error: 'contracts array required' });

    if (!client.isTokenValid()) {
        return res.json({ connected: false, quotes: {} });
    }

    // Validate and map contracts to instrument format needed by SmartAPI
    // FIX: Options MUST use NFO (or BFO for Bombay derivatives) — never NSE/BSE
    const instruments = contracts.map(c => {
        const exchSeg = c.exch_seg || c.exchange || 'NFO';
        // Options must be fetched from NFO
        const correctedExch = (exchSeg === 'NSE' || exchSeg === 'BSE' || exchSeg === 'NSE_CM') ? 'NFO' : exchSeg;
        if (correctedExch !== exchSeg) {
            console.warn(`[Server] /option-ltp — Corrected exchange ${exchSeg} → ${correctedExch} for token=${c.token} (${c.underlying} ${c.strike}${c.type})`);
        }
        return {
            exchange:      correctedExch,
            symboltoken:   tokenKey(c.token),
            tradingsymbol: c.tradingsymbol || c.symbol || '',
        };
    });

    console.log(`[Server] /option-ltp — fetching FULL quote for ${instruments.length} contracts`);
    const quoteMap = await batchQuote(instruments, 'FULL');
    console.log(`[Server] /option-ltp — quoteMap has ${Object.keys(quoteMap).length / 2} unique entries`);

    const quotes = {};
    let hits = 0, misses = 0;

    for (const c of contracts) {
        const key    = tokenKey(c.token);
        const q      = quoteMap[key] || quoteMap[key.toLowerCase()];

        if (q) {
            const ltp    = parseFloat(q.ltp)            || 0;
            const close  = parseFloat(q.closePrice)     || 0;
            const oi     = parseInt(q.opnInterest, 10)  || 0;
            const volume = parseInt(q.tradeVolume ?? q.volume, 10) || 0;

            quotes[key] = {
                ltp,
                closePrice: close,
                oi,
                volume,
                open:       parseFloat(q.open)          || 0,
                high:       parseFloat(q.high)          || 0,
                low:        parseFloat(q.low)           || 0,
                netChange:  parseFloat(q.netChange)     || 0,
                pctChange:  parseFloat(q.percentChange) || 0,
            };

            console.log(
                `[Server] ✅ Option LTP: token=${key} sym=${c.tradingsymbol} ` +
                `normStrike=${c.strike} rawStrike=${c.rawStrike || 'N/A'} ` +
                `expiry=${c.expiry || ''} type=${c.type} ` +
                `→ LTP=₹${ltp} OI=${oi} Vol=${volume} Close=₹${close}`
            );
            hits++;
        } else {
            console.warn(
                `[Server] ⚠️  Option LTP miss: token=${key}` +
                ` (${c.underlying || ''} ${c.strike || ''}${c.type || ''} ${c.expiry || ''})`
            );
            misses++;
        }
    }

    console.log(`[Server] /option-ltp — ${hits} hits, ${misses} misses out of ${contracts.length} contracts`);
    res.json({ connected: true, quotes });
});

// ─── Debug: inspect a single option contract ──────────────────────────────────
// GET /api/debug/option?symbol=NIFTY&strike=24500&type=CE&expiry=29MAY2026
app.get('/api/debug/option', (req, res) => {
    const { symbol, strike, type, expiry } = req.query;
    if (!symbol || !strike || !type) {
        return res.status(400).json({ error: 'symbol, strike, type required' });
    }
    const debugInfo = instrumentUtils.getContractDebugInfo(
        symbol, expiry, parseFloat(strike), type?.toUpperCase()
    );
    res.json(debugInfo);
});

// ─── Debug: validate a contract with live Angel One data ─────────────────────
// GET /api/debug/validate?symbol=NIFTY&strike=24500&type=CE&expiry=29MAY2026
app.get('/api/debug/validate', async (req, res) => {
    const { symbol, strike, type, expiry } = req.query;
    if (!symbol || !strike || !type) {
        return res.status(400).json({ error: 'symbol, strike, type required' });
    }

    const strikeNum  = parseFloat(strike);
    const typeUpper  = type.toUpperCase();
    const debugInfo  = instrumentUtils.getContractDebugInfo(symbol, expiry, strikeNum, typeUpper);
    const contract   = debugInfo.contract;

    let liveData = null;
    let spotData = null;

    if (client.isTokenValid() && contract) {
        console.log(`[Server] /debug/validate — fetching live data for token=${contract.token}`);

        // Fetch live option LTP
        const optInstr = [{
            exchange:      contract.exch_seg,
            symboltoken:   tokenKey(contract.token),
            tradingsymbol: contract.symbol,
        }];
        const quoteMap = await batchQuote(optInstr, 'FULL');
        const q        = quoteMap[tokenKey(contract.token)];
        if (q) {
            liveData = {
                ltp:       parseFloat(q.ltp)           || 0,
                closePrice: parseFloat(q.closePrice)   || 0,
                oi:        parseInt(q.opnInterest, 10) || 0,
                volume:    parseInt(q.tradeVolume ?? q.volume, 10) || 0,
                open:      parseFloat(q.open)          || 0,
                high:      parseFloat(q.high)          || 0,
                low:       parseFloat(q.low)           || 0,
            };
        }

        // Fetch spot price
        const cashTok = instrumentUtils.getCashToken(symbol);
        if (cashTok) {
            const spotMap = await batchQuote([cashTok], 'LTP');
            const sq      = spotMap[tokenKey(cashTok.symboltoken)];
            if (sq) spotData = parseFloat(sq.ltp) || null;
        }
    }

    const response = {
        queried: { symbol, strike: strikeNum, type: typeUpper, expiry: expiry || 'auto' },
        resolved: instrumentUtils.resolveSymbol(symbol),
        ...debugInfo,
        liveData,
        spotPrice: spotData,
        mode: client.isTokenValid() ? 'LIVE' : 'MOCK (not connected)',
    };

    // Pretty console log for comparison with Angel One terminal
    console.log('\n[Server] ══════════ DEBUG VALIDATION ══════════');
    console.log(`  Symbol       : ${symbol} (resolved: ${response.resolved})`);
    console.log(`  Strike       : ${strikeNum} (raw in scrip master: ${contract?.rawStrike || 'N/A'})`);
    console.log(`  Type         : ${typeUpper}`);
    console.log(`  Expiry       : ${debugInfo.targetExpiry || 'N/A'}`);
    console.log(`  Token        : ${contract?.token || 'NOT FOUND'}`);
    console.log(`  Trading Sym  : ${contract?.symbol || 'NOT FOUND'}`);
    console.log(`  Exchange     : ${contract?.exch_seg || 'N/A'}`);
    console.log(`  Spot Price   : ${spotData != null ? '₹' + spotData : 'N/A'}`);
    if (liveData) {
        console.log(`  Live LTP     : ₹${liveData.ltp}`);
        console.log(`  OI           : ${liveData.oi}`);
        console.log(`  Volume       : ${liveData.volume}`);
        console.log(`  Day Range    : ₹${liveData.low} – ₹${liveData.high}`);
    } else {
        console.log('  Live data    : N/A (not connected or token not found)');
    }
    console.log('[Server] ════════════════════════════════════════\n');

    res.json(response);
});

// ─── Debug: validate spot price for a symbol ─────────────────────────────────
// GET /api/debug/spot?symbol=NIFTY
app.get('/api/debug/spot', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });

    const cashTok = instrumentUtils.getCashToken(symbol);
    let liveSpot  = null;
    let quoteRaw  = null;

    if (client.isTokenValid() && cashTok) {
        const spotMap = await batchQuote([cashTok], 'LTP');
        const key     = tokenKey(cashTok.symboltoken);
        const q       = spotMap[key] || spotMap[key.toLowerCase()];
        quoteRaw = q || null;
        liveSpot = q ? (parseFloat(q.ltp) || null) : null;
    }

    console.log(`[Server] /debug/spot: ${symbol} → token=${cashTok?.symboltoken || 'NOT FOUND'} spot=₹${liveSpot}`);

    res.json({
        symbol,
        resolved:     instrumentUtils.resolveSymbol(symbol),
        cashToken:    cashTok,
        liveSpot,
        quoteRaw,
        mode:         client.isTokenValid() ? 'LIVE' : 'MOCK',
    });
});

// ─── Debug: dump indexed scrip data for an underlying ────────────────────────
// GET /api/debug/scrip?underlying=NIFTY&expiry=29MAY2026
app.get('/api/debug/scrip', (req, res) => {
    const { underlying, expiry } = req.query;
    if (!underlying) return res.status(400).json({ error: 'underlying required' });

    const resolved  = instrumentUtils.resolveSymbol(underlying);
    const cache     = instrumentUtils._optionsCache();
    const uCache    = cache[resolved] || cache[underlying];

    if (!uCache) {
        return res.status(404).json({ error: `${underlying} not in scrip master cache`, resolved });
    }

    const expiries  = instrumentUtils.getAvailableExpiries(underlying);
    const target    = expiry && expiries.includes(expiry) ? expiry : expiries[0];

    const strikesObj = uCache[target] || {};
    const strikeSummary = {};
    for (const [s, d] of Object.entries(strikesObj)) {
        strikeSummary[s] = {
            CE: d.CE ? { token: d.CE.token, sym: d.CE.symbol, rawStrike: d.CE.rawStrike } : null,
            PE: d.PE ? { token: d.PE.token, sym: d.PE.symbol, rawStrike: d.PE.rawStrike } : null,
        };
    }

    res.json({
        underlying,
        resolved,
        expiries,
        targetExpiry: target,
        strikeCount:  Object.keys(strikeSummary).length,
        strikes:      strikeSummary,
    });
});

// ─── Debug: token → contract reverse map (paginated) ─────────────────────────
// GET /api/debug/token-map?token=35000   OR   /api/debug/token-map?limit=50&offset=0
app.get('/api/debug/token-map', (req, res) => {
    const { token, limit = 50, offset = 0 } = req.query;
    const map = instrumentUtils._tokenToContract();

    if (token) {
        const contract = map[tokenKey(token)];
        return res.json({ token, contract: contract || null });
    }

    const keys    = Object.keys(map);
    const page    = keys.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));
    const partial = {};
    for (const k of page) partial[k] = map[k];

    res.json({ total: keys.length, offset: parseInt(offset, 10), limit: parseInt(limit, 10), map: partial });
});

// ─── FNO instruments list (dynamic from scrip master) ────────────────────────
app.get('/api/instruments/fno', (req, res) => {
    res.json({ instruments: instrumentUtils.getAllCashTokens() });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n🚀 AntiGravity Backend  →  http://localhost:${PORT}`);
    console.log('   GET  /api/health');
    console.log('   GET  /api/auth/status');
    console.log('   POST /api/auth/login');
    console.log('   POST /api/market/quote');
    console.log('   POST /api/market/option-ltp');
    console.log('   POST /api/instruments/spot');
    console.log('   POST /api/instruments/bulk-options');
    console.log('   GET  /api/instruments/status');
    console.log('   GET  /api/debug/option?symbol=NIFTY&strike=24500&type=CE');
    console.log('   GET  /api/debug/validate?symbol=NIFTY&strike=24500&type=CE&expiry=29MAY2026');
    console.log('   GET  /api/debug/spot?symbol=NIFTY');
    console.log('   GET  /api/debug/scrip?underlying=NIFTY');
    console.log('   GET  /api/debug/token-map?token=35000\n');

    // Load scrip master first (~10s), then login
    await instrumentUtils.fetchAndCacheScripMaster();
    setInterval(instrumentUtils.fetchAndCacheScripMaster, 24 * 60 * 60 * 1000); // daily refresh

    await autoLogin();
    setInterval(autoLogin, 5.5 * 60 * 60 * 1000); // refresh token every 5.5h
});
