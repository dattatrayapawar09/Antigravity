/**
 * AntiGravity — Angel One SmartAPI Proxy Backend
 * Provides auth, spot prices, option chain mapping, and live quote APIs.
 * Run: node server.js   (from /backend directory)
 */

const path         = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
if (dotenvResult.error) {
    console.error('[Env] dotenv error:', dotenvResult.error.message);
} else {
    console.log('[Env] Loaded:', path.join(__dirname, '.env'));
}

const apiKey   = process.env.ANGEL_API_KEY    || '';
const clientId = process.env.ANGEL_CLIENT_ID  || process.env.ANGEL_CLIENT_CODE || '';
const password = process.env.ANGEL_PASSWORD   || '';
const totpSec  = process.env.ANGEL_TOTP_SECRET|| '';
const PORT     = parseInt(process.env.PORT)   || 3001;

console.log('[Env] ANGEL_API_KEY     :', apiKey    ? `${apiKey.slice(0,4)}****` : 'MISSING ⚠️');
console.log('[Env] ANGEL_CLIENT_ID   :', clientId  ? clientId                  : 'MISSING ⚠️');
console.log('[Env] ANGEL_PASSWORD    :', password  ? '****'                    : 'MISSING ⚠️');
console.log('[Env] ANGEL_TOTP_SECRET :', totpSec   ? `${totpSec.slice(0,4)}****` : 'MISSING ⚠️');

const express         = require('express');
const cors            = require('cors');
const SmartAPI        = require('./smartapi');
const instrumentUtils = require('./utils/instrumentUtils');

const app    = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const client = new SmartAPI({ apiKey, clientId, password, totpSecret: totpSec });

// ─── Auto-login ──────────────────────────────────────────────────────────────
async function autoLogin() {
    const result = await client.login();
    if (result.success) {
        console.log('[Server] ✅ SmartAPI authenticated — LIVE MODE active');
    } else {
        console.warn(`[Server] ⚠️  SmartAPI auth failed (${result.reason}) — MOCK MODE`);
    }
}

// ─── Helper: Batch Quote Fetch ────────────────────────────────────────────────
// SmartAPI allows max 50 tokens per call. Groups by exchange for the API.
async function batchQuote(instruments, mode = 'LTP') {
    const BATCH = 50;
    const results = {};
    for (let i = 0; i < instruments.length; i += BATCH) {
        const batch = instruments.slice(i, i + BATCH);
        try {
            const data = await client.getQuote(batch, mode);
            if (!data) { console.warn('[Server] batchQuote: null response from getQuote'); continue; }
            const fetched = data.fetched || [];
            if (i === 0) {
                console.log(`[Server] batchQuote sample response key: ${fetched[0] ? JSON.stringify(Object.keys(fetched[0])) : 'empty'}`);
            }
            fetched.forEach(q => {
                // Angel One response uses 'symbolToken' (camelCase with capital T)
                const key = String(q.symbolToken || q.symboltoken || q.token || '');
                if (key) results[key] = q;
            });
            console.log(`[Server] batchQuote batch ${Math.floor(i/BATCH)+1}: ${fetched.length} filled of ${batch.length} requested`);
        } catch (e) {
            console.error('[Server] batchQuote error:', e.message);
        }
    }
    return results;
}


// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: client.isTokenValid() ? 'LIVE' : 'MOCK' });
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

// ─── Option chain (Angel One native) ─────────────────────────────────────────
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
        symbol, expiry, parseFloat(spotPrice), numStrikes ? parseInt(numStrikes) : 10
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
            r.symbol, r.expiry, parseFloat(r.spotPrice), numStrikes ? parseInt(numStrikes) : 10
        );
    }
    res.json(results);
});

// ─── Live Spot Prices ─────────────────────────────────────────────────────────
// POST /api/instruments/spot
// Body: { symbols: ['NIFTY','BANKNIFTY','RELIANCE',...] }
// Returns: { connected, spotPrices: { NIFTY: 24150, BANKNIFTY: 54200, ... } }
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
            instruments.push({ ...tok, _appSym: sym });
        } else {
            console.warn(`[Server] /spot — no cash token for: ${sym}`);
        }
    }

    console.log(`[Server] /spot — fetching LTP for ${instruments.length}/${symbols.length} symbols`);
    const quoteMap = await batchQuote(instruments, 'LTP');

    for (const instr of instruments) {
        const q = quoteMap[String(instr.symboltoken)];
        if (q && q.ltp) {
            const ltp = parseFloat(q.ltp);
            spotPrices[instr._appSym] = ltp;
            console.log(`[Server] Spot: ${instr._appSym} (${instr.exchange}:${instr.tradingsymbol} token=${instr.symboltoken}) = ₹${ltp}`);
        } else {
            console.warn(`[Server] Spot miss: ${instr._appSym} token=${instr.symboltoken} — no LTP in response`);
        }
    }

    console.log(`[Server] /spot — returned ${Object.keys(spotPrices).length}/${symbols.length} prices`);
    res.json({ connected: true, spotPrices });
});

// ─── Live Option LTP / OI / Volume ───────────────────────────────────────────
// POST /api/market/option-ltp
// Body: { contracts: [{token, exchange, tradingsymbol, underlying, strike, type, expiry}] }
// Returns: { connected, quotes: { token: {ltp, oi, volume, closePrice, netChange, pctChange} } }
app.post('/api/market/option-ltp', async (req, res) => {
    const { contracts = [] } = req.body;
    if (!contracts.length) return res.status(400).json({ error: 'contracts array required' });

    if (!client.isTokenValid()) {
        return res.json({ connected: false, quotes: {} });
    }

    // Map contracts to instrument format needed by SmartAPI
    const instruments = contracts.map(c => ({
        exchange:      c.exch_seg || c.exchange || 'NFO',
        symboltoken:   String(c.token),
        tradingsymbol: c.tradingsymbol || c.symbol || '',
    }));

    console.log(`[Server] /option-ltp — fetching FULL quote for ${instruments.length} contracts`);
    const quoteMap = await batchQuote(instruments, 'FULL');

    const quotes = {};
    for (const c of contracts) {
        const key = String(c.token);
        const q   = quoteMap[key];
        if (q) {
            quotes[key] = {
                ltp:        parseFloat(q.ltp)          || 0,
                closePrice: parseFloat(q.closePrice)   || 0,
                oi:         parseInt(q.opnInterest)    || 0,
                volume:     parseInt(q.tradeVolume || q.volume) || 0,
                open:       parseFloat(q.open)         || 0,
                high:       parseFloat(q.high)         || 0,
                low:        parseFloat(q.low)          || 0,
                netChange:  parseFloat(q.netChange)    || 0,
                pctChange:  parseFloat(q.percentChange)|| 0,
            };
            console.log(`[Server] Option LTP: ${c.underlying} ${c.expiry} ${c.strike} ${c.type} (${key}) → ₹${quotes[key].ltp} OI=${quotes[key].oi} Vol=${quotes[key].volume}`);
        } else {
            console.warn(`[Server] Option LTP miss: token=${key} (${c.underlying} ${c.strike}${c.type})`);
        }
    }

    console.log(`[Server] /option-ltp — ${Object.keys(quotes).length}/${contracts.length} filled`);
    res.json({ connected: true, quotes });
});

// ─── Debug: inspect a single option contract ─────────────────────────────────
app.get('/api/debug/option', (req, res) => {
    const { symbol, strike, type, expiry } = req.query;
    if (!symbol || !strike || !type) return res.status(400).json({ error: 'symbol, strike, type required' });
    const contract = instrumentUtils.mapInstrumentToken(symbol, expiry, parseFloat(strike), type);
    res.json({
        queried: { symbol, strike: parseFloat(strike), type, expiry },
        result:  contract,
        resolved: instrumentUtils.resolveSymbol(symbol),
        expiries: instrumentUtils.getAvailableExpiries(symbol),
    });
});

// ─── FNO instruments list (dynamic from scrip master) ────────────────────────
app.get('/api/instruments/fno', (req, res) => {
    res.json({ instruments: instrumentUtils.getAllCashTokens() });
});

// ─── Start ───────────────────────────────────────────────────────────────────
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
    console.log('   GET  /api/debug/option?symbol=NIFTY&strike=24500&type=CE\n');

    // Load scrip master first (takes ~10s), then login
    await instrumentUtils.fetchAndCacheScripMaster();
    setInterval(instrumentUtils.fetchAndCacheScripMaster, 24 * 60 * 60 * 1000); // daily refresh

    await autoLogin();
    setInterval(autoLogin, 5.5 * 60 * 60 * 1000); // refresh token every 5.5h
});
