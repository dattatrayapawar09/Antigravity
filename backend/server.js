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
    const instruments = [
        { exchange: 'NSE', tradingsymbol: 'NIFTY',      symboltoken: '26000' },
        { exchange: 'NSE', tradingsymbol: 'BANKNIFTY',  symboltoken: '26009' },
        { exchange: 'BSE', tradingsymbol: 'SENSEX',     symboltoken: '1' },
        { exchange: 'NSE', tradingsymbol: 'FINNIFTY',   symboltoken: '26037' },
        { exchange: 'NSE', tradingsymbol: 'MIDCPNIFTY', symboltoken: '26074' },
        { exchange: 'NSE', tradingsymbol: 'RELIANCE',   symboltoken: '2885' },
        { exchange: 'NSE', tradingsymbol: 'HDFCBANK',   symboltoken: '1333' },
        { exchange: 'NSE', tradingsymbol: 'ICICIBANK',  symboltoken: '4963' },
        { exchange: 'NSE', tradingsymbol: 'INFY',       symboltoken: '1594' },
        { exchange: 'NSE', tradingsymbol: 'TCS',        symboltoken: '11536' },
        { exchange: 'NSE', tradingsymbol: 'ITC',        symboltoken: '1660' },
        { exchange: 'NSE', tradingsymbol: 'SBIN',       symboltoken: '3045' },
        { exchange: 'NSE', tradingsymbol: 'BHARTIARTL', symboltoken: '10604' },
        { exchange: 'NSE', tradingsymbol: 'KOTAKBANK',  symboltoken: '1922' },
        { exchange: 'NSE', tradingsymbol: 'LT',         symboltoken: '11483' },
        { exchange: 'NSE', tradingsymbol: 'AXISBANK',   symboltoken: '5900' },
        { exchange: 'NSE', tradingsymbol: 'BAJFINANCE', symboltoken: '317' },
        { exchange: 'NSE', tradingsymbol: 'MARUTI',     symboltoken: '10999' },
        { exchange: 'NSE', tradingsymbol: 'ASIANPAINT', symboltoken: '236' },
        { exchange: 'NSE', tradingsymbol: 'HINDUNILVR', symboltoken: '1394' },
    ];
    res.json({ instruments });
});

/**
 * GET /api/instruments/status
 * Returns whether scrip master has been loaded
 */
app.get('/api/instruments/status', (req, res) => {
    res.json(instrumentUtils.getCacheStatus());
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
