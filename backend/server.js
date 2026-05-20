/**
 * Angel One SmartAPI Proxy Backend
 * Handles auth, token caching, and proxies market data to the frontend.
 * Run: node server.js (from /backend directory)
 */

const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
if (dotenvResult.error) {
    console.error('[DEBUG] dotenv load error:', dotenvResult.error.message);
} else {
    console.log('[DEBUG] dotenv loaded from:', path.join(__dirname, '.env'));
}

// Print all relevant env vars for debugging
const apiKey    = process.env.ANGEL_API_KEY    || '';
const clientId  = process.env.ANGEL_CLIENT_ID  || process.env.ANGEL_CLIENT_CODE || '';
const password  = process.env.ANGEL_PASSWORD   || '';
const totpSec   = process.env.ANGEL_TOTP_SECRET|| '';

console.log('[DEBUG] ANGEL_API_KEY     :', apiKey    ? `${apiKey.slice(0,4)}*** (loaded)` : 'MISSING');
console.log('[DEBUG] ANGEL_CLIENT_ID   :', clientId  ? `${clientId}       (loaded)` : 'MISSING');
console.log('[DEBUG] ANGEL_PASSWORD    :', password  ? '***     (loaded)' : 'MISSING');
console.log('[DEBUG] ANGEL_TOTP_SECRET :', totpSec   ? `${totpSec.slice(0,4)}*** (loaded)` : 'MISSING');

const express  = require('express');
const cors     = require('cors');
const SmartAPI = require('./smartapi');
const instrumentUtils = require('./utils/instrumentUtils');

const app  = express();
const PORT = process.env.PORT || 3001;

// --- CORS: allow the local file:// frontend and any localhost ---
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- SmartAPI Client ---
const client = new SmartAPI({ apiKey, clientId, password, totpSecret: totpSec });

// --- Token auto-refresh every 5 hours ---
async function autoLogin() {
    const result = await client.login();
    if (result.success) {
        console.log('[Server] ✅ SmartAPI authenticated — LIVE MODE active');
    } else {
        console.log(`[Server] ⚠️  SmartAPI not authenticated (${result.reason}) — MOCK MODE`);
    }
}

// --- Routes ---

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/auth/status
 */
app.get('/api/auth/status', (req, res) => {
    const connected = client.isTokenValid();
    res.json({
        connected,
        mode:     connected ? 'LIVE' : 'MOCK',
        clientId: connected ? clientId : null,
    });
});

/**
 * POST /api/auth/login  — trigger a fresh login
 */
app.post('/api/auth/login', async (req, res) => {
    const result = await client.login();
    res.json({
        success:   result.success,
        connected: client.isTokenValid(),
        mode:      client.isTokenValid() ? 'LIVE' : 'MOCK',
        reason:    result.reason || null,
    });
});

/**
 * POST /api/market/quote
 * Body: { instruments: [{ exchange, symboltoken, tradingsymbol }], mode: 'LTP'|'FULL' }
 */
app.post('/api/market/quote', async (req, res) => {
    const { instruments = [], mode = 'FULL' } = req.body;

    if (!client.isTokenValid()) {
        return res.json({ connected: false, data: null });
    }
    if (!instruments.length) {
        return res.status(400).json({ error: 'instruments array is required' });
    }

    const data = await client.getQuote(instruments, mode);
    res.json({ connected: true, data });
});

/**
 * POST /api/market/optionchain
 * Body: { symbol, expiryDate, strikePrice }
 */
app.post('/api/market/optionchain', async (req, res) => {
    const { symbol, expiryDate, strikePrice } = req.body;

    if (!client.isTokenValid()) {
        return res.json({ connected: false, data: null });
    }

    const data = await client.getOptionChain(symbol, expiryDate, strikePrice);
    res.json({ connected: true, data });
});

/**
 * GET /api/instruments/options
 * Query: ?symbol=NIFTY&spotPrice=23700&numStrikes=10
 */
app.get('/api/instruments/options', (req, res) => {
    const { symbol, expiry, spotPrice, numStrikes } = req.query;
    if (!symbol)    return res.status(400).json({ error: 'symbol query param is required' });
    if (!spotPrice) return res.status(400).json({ error: 'spotPrice query param is required' });

    const mapping = instrumentUtils.generateOptionChainMapping(
        symbol, expiry, parseFloat(spotPrice), numStrikes ? parseInt(numStrikes, 10) : 10
    );
    if (mapping.error) return res.status(404).json(mapping);
    res.json(mapping);
});

/**
 * POST /api/instruments/bulk-options
 * Body: { requests: [{ symbol, expiry, spotPrice }], numStrikes }
 */
app.post('/api/instruments/bulk-options', (req, res) => {
    const { requests, numStrikes } = req.body;
    if (!Array.isArray(requests)) return res.status(400).json({ error: 'requests array is required' });

    const results = {};
    for (const r of requests) {
        if (!r.symbol || !r.spotPrice) continue;
        const symKey = instrumentUtils.resolveSymbol(r.symbol);
        results[r.symbol] = instrumentUtils.generateOptionChainMapping(
            symKey || r.symbol, r.expiry, parseFloat(r.spotPrice), numStrikes ? parseInt(numStrikes, 10) : 10
        );
    }
    res.json(results);
});

/**
 * GET /api/instruments/fno
 * Key F&O instrument tokens for NIFTY, BANKNIFTY, and top stocks
 */
app.get('/api/instruments/fno', (req, res) => {
    // Dynamically return all cash market tokens indexed from scrip master
    const instruments = instrumentUtils.getAllCashTokens();
    res.json({ instruments });
});

/**
 * GET /api/instruments/status
 * Returns whether scrip master has been loaded
 */
app.get('/api/instruments/status', (req, res) => {
    res.json(instrumentUtils.getCacheStatus());
});

/**
 * POST /api/instruments/spot
 * Body: { symbols: ['NIFTY','BANKNIFTY','RELIANCE',...] }
 * Returns live spot prices { NIFTY: 24150, BANKNIFTY: 54200, ... }
 * Batches requests to avoid SmartAPI 50-instrument limit.
 */
app.post('/api/instruments/spot', async (req, res) => {
    const { symbols = [] } = req.body;
    if (!symbols.length) return res.status(400).json({ error: 'symbols array required' });

    // Build instrument list from cached scrip master tokens
    const allTokens  = instrumentUtils.getAllCashTokens();
    const tokenMap   = {};
    allTokens.forEach(t => { tokenMap[t.tradingsymbol] = t; });

    const requested = [];
    symbols.forEach(sym => {
        const resolved = instrumentUtils.resolveSymbol(sym);
        const tok = tokenMap[resolved] || tokenMap[sym];
        if (tok) requested.push({ ...tok, _appSym: sym });
    });

    const spotPrices = {};

    if (!client.isTokenValid()) {
        // Return empty — frontend will fall back to BASE_PRICES
        return res.json({ connected: false, spotPrices });
    }

    // SmartAPI allows max 50 tokens per quote call — batch them
    const BATCH = 50;
    for (let i = 0; i < requested.length; i += BATCH) {
        const batch = requested.slice(i, i + BATCH);
        try {
            const data = await client.getQuote(batch, 'LTP');
            const fetched = data?.fetched || [];
            fetched.forEach(item => {
                const ltp = parseFloat(item.ltp);
                if (!ltp) return;
                // Match back to app symbol
                const ts  = item.tradingSymbol;
                const hit = batch.find(b => b.tradingsymbol === ts);
                if (hit) spotPrices[hit._appSym] = ltp;
            });
        } catch (e) {
            console.error('[Server] Spot price batch error:', e.message);
        }
    }

    console.log(`[Server] Spot prices fetched: ${Object.keys(spotPrices).length}/${symbols.length}`);
    res.json({ connected: true, spotPrices });
});

// --- Start ---
app.listen(PORT, async () => {
    console.log(`\n🚀 AntiGravity SmartAPI Backend running on http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/auth/status`);
    console.log(`   POST /api/auth/login`);
    console.log(`   POST /api/market/quote`);
    console.log(`   POST /api/market/optionchain`);
    console.log(`   GET  /api/instruments/fno`);
    console.log(`   GET  /api/instruments/options`);
    console.log(`   GET  /api/instruments/status\n`);

    // Load scrip master in background
    instrumentUtils.fetchAndCacheScripMaster();
    // Auto-refresh scrip master daily at 8 AM
    setInterval(instrumentUtils.fetchAndCacheScripMaster, 24 * 60 * 60 * 1000);

    await autoLogin();
    // Auto-refresh token every 5.5 hours
    setInterval(autoLogin, 5.5 * 60 * 60 * 1000);
});
