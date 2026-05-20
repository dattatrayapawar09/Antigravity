/**
 * Angel One SmartAPI Proxy Backend
 * Handles auth, token caching, and proxies market data to the frontend.
 * Run: node server.js (from /backend directory)
 */

const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
if (dotenvResult.error) {
    console.error('[DEBUG] dotenv load error:', dotenvResult.error);
} else {
    console.log('[DEBUG] dotenv loaded successfully');
}
console.log('[DEBUG] ANGEL_API_KEY loaded:', !!process.env.ANGEL_API_KEY);
console.log('[DEBUG] ANGEL_CLIENT_ID loaded:', !!process.env.ANGEL_CLIENT_ID);
const express    = require('express');
const cors       = require('cors');
const SmartAPI   = require('./smartapi');
const instrumentUtils = require('./utils/instrumentUtils');

const app  = express();
const PORT = process.env.PORT || 3001;

// --- CORS: allow the local file:// frontend and any localhost ---
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- SmartAPI Client ---
const client = new SmartAPI({
    apiKey:      process.env.ANGEL_API_KEY,
    clientId:    process.env.ANGEL_CLIENT_ID || process.env.ANGEL_CLIENT_CODE,
    password:    process.env.ANGEL_PASSWORD,
    totpSecret:  process.env.ANGEL_TOTP_SECRET,
});

// --- Token auto-refresh every 5 hours ---
async function autoLogin() {
    const result = await client.login();
    if (result.success) {
        console.log('[Server] SmartAPI authenticated — LIVE MODE active');
    } else {
        console.log(`[Server] SmartAPI not authenticated (${result.reason}) — MOCK MODE`);
    }
}

// --- Routes ---

/**
 * GET /api/health
 * Simple health check
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/auth/status
 * Returns whether we are connected to SmartAPI live
 */
app.get('/api/auth/status', (req, res) => {
    const connected = client.isTokenValid();
    res.json({
        connected,
        mode:     connected ? 'LIVE' : 'MOCK',
        clientId: connected ? process.env.ANGEL_CLIENT_ID : null,
    });
});

/**
 * POST /api/auth/login
 * Trigger a fresh login (useful after key update in .env)
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
 * Returns raw SmartAPI quote data, or null if in mock mode
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
 * Returns option chain data from SmartAPI
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
 * Query: ?symbol=NIFTY&expiry=25JAN2024&spotPrice=23700&numStrikes=10
 * Returns standard mapped CE/PE token chain for the requested options.
 */
app.get('/api/instruments/options', (req, res) => {
    const { symbol, expiry, spotPrice, numStrikes } = req.query;
    
    if (!symbol) return res.status(400).json({ error: 'symbol query param is required' });
    if (!spotPrice) return res.status(400).json({ error: 'spotPrice query param is required' });
    
    const mapping = instrumentUtils.generateOptionChainMapping(
        symbol, 
        expiry, 
        parseFloat(spotPrice), 
        numStrikes ? parseInt(numStrikes, 10) : 10
    );
    
    if (mapping.error) {
        return res.status(404).json(mapping);
    }
    
    res.json(mapping);
});

/**
 * POST /api/instruments/bulk-options
 * Body: { requests: [{ symbol, expiry, spotPrice }], numStrikes }
 * Returns mappings for multiple symbols
 */
app.post('/api/instruments/bulk-options', (req, res) => {
    const { requests, numStrikes } = req.body;
    if (!Array.isArray(requests)) return res.status(400).json({ error: 'requests array is required' });
    
    const results = {};
    for (const req of requests) {
        if (!req.symbol || !req.spotPrice) continue;
        results[req.symbol] = instrumentUtils.generateOptionChainMapping(
            req.symbol, 
            req.expiry, 
            parseFloat(req.spotPrice), 
            numStrikes ? parseInt(numStrikes, 10) : 10
        );
    }
    res.json(results);
});

/**
 * GET /api/instruments/fno
 * Returns key F&O instrument tokens for NIFTY, BANKNIFTY, and top stocks
 * These tokens are static (from Angel One instrument master) and rarely change
 */
app.get('/api/instruments/fno', (req, res) => {
    // Key instrument tokens for indices (NSE F&O)
    // Full list: https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
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
    console.log(`   GET  /api/instruments/options\n`);
    
    await instrumentUtils.fetchAndCacheScripMaster();
    // Auto-refresh scrip master daily
    setInterval(instrumentUtils.fetchAndCacheScripMaster, 24 * 60 * 60 * 1000);
    
    await autoLogin();
    // Auto-refresh every 5.5 hours
    setInterval(autoLogin, 5.5 * 60 * 60 * 1000);
});
