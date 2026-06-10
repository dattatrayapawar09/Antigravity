/**
 * AntiGravity — Angel One SmartAPI Proxy Backend
 * Production-safe bootstrap for Render deployment
 *
 * Key Improvements:
 * 1. dotenv loads ONLY in development
 * 2. Required env validation added
 * 3. Server starts immediately (prevents Render health-check failures)
 * 4. Safe auto-login lock
 * 5. Graceful startup handling
 * 6. Production-ready environment handling
 */

const path = require('path');

/* ──────────────────────────────────────────────────────────────
 * ENVIRONMENT LOADING
 * ────────────────────────────────────────────────────────────── */

// Load .env only for local development
if (process.env.NODE_ENV !== 'production') {
    const dotenv = require('dotenv');

    const result = dotenv.config({
        path: path.join(__dirname, '.env')
    });

    if (result.error) {
        console.warn('[Env] Local .env not found');
    } else {
        console.log('[Env] Loaded local .env');
    }
} else {
    console.log('[Env] Production mode — using Render environment variables');
}

/* ──────────────────────────────────────────────────────────────
 * REQUIRED ENV VALIDATION
 * ────────────────────────────────────────────────────────────── */

function requiredEnv(name) {
    const value = process.env[name];

    if (!value || !String(value).trim()) {
        console.error(`❌ [Env] Missing required environment variable: ${name}`);
        process.exit(1);
    }

    return String(value).trim();
}

const apiKey   = requiredEnv('ANGEL_API_KEY');
const clientId = requiredEnv('ANGEL_CLIENT_ID');
const password = requiredEnv('ANGEL_PASSWORD');
const totpSec  = requiredEnv('ANGEL_TOTP_SECRET');

const PORT = parseInt(process.env.PORT || '3001', 10);
const DEBUG = process.env.DEBUG_LOG === 'true';
function log(...args) { if (DEBUG) console.log(...args); }

/* ──────────────────────────────────────────────────────────────
 * SAFE LOGGING
 * ────────────────────────────────────────────────────────────── */

console.log('[Env] ANGEL_API_KEY     :', `${apiKey.slice(0, 4)}****`);
console.log('[Env] ANGEL_CLIENT_ID   :', clientId);
console.log('[Env] ANGEL_PASSWORD    :', '****');
console.log('[Env] ANGEL_TOTP_SECRET :', `${totpSec.slice(0, 4)}****`);
console.log('[Env] PORT              :', PORT);

/* ──────────────────────────────────────────────────────────────
 * IMPORTS
 * ────────────────────────────────────────────────────────────── */

const express         = require('express');
const cors            = require('cors');
const SmartAPI        = require('./smartapi');
const instrumentUtils = require('./utils/instrumentUtils');

/* ──────────────────────────────────────────────────────────────
 * EXPRESS SETUP
 * ────────────────────────────────────────────────────────────── */

const app = express();

app.use(cors({
    origin: '*'
}));

app.use(express.json({
    limit: '2mb'
}));

/* ──────────────────────────────────────────────────────────────
 * SMART API CLIENT
 * ────────────────────────────────────────────────────────────── */

const client = new SmartAPI({
    apiKey,
    clientId,
    password,
    totpSecret: totpSec
});

/* ──────────────────────────────────────────────────────────────
 * LOGIN LOCK
 * Prevent overlapping logins
 * ────────────────────────────────────────────────────────────── */

let loginInProgress = false;

async function autoLogin() {
    if (loginInProgress) {
        console.log('[Auth] Login already in progress — skipping');
        return;
    }

    loginInProgress = true;

    try {
        console.log('[Auth] Attempting SmartAPI login...');

        const result = await client.login();

        if (result.success) {
            console.log('[Auth] ✅ SmartAPI authenticated');
        } else {
            console.error('[Auth] ❌ Login failed:', result.reason || 'Unknown');

            // In production fail hard
            if (process.env.NODE_ENV === 'production') {
                console.error('[Auth] Exiting process due to auth failure');
                process.exit(1);
            }
        }
    } catch (err) {
        console.error('[Auth] Fatal login error:', err.message);

        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    } finally {
        loginInProgress = false;
    }
}

/* ──────────────────────────────────────────────────────────────
 * HELPERS
 * ────────────────────────────────────────────────────────────── */

function tokenKey(t) {
    return String(t ?? '').trim().toLowerCase();
}

async function retry(fn, retries = 3, delay = 500) {
    try {
        return await fn();
    } catch (err) {
        if (retries <= 0) throw err;

        console.warn(`[Retry] ${err.message} — retrying in ${delay}ms`);

        await new Promise(r => setTimeout(r, delay));

        return retry(fn, retries - 1, delay * 2);
    }
}

async function withTimeout(promise, ms = 7000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), ms)
        )
    ]);
}

/* ──────────────────────────────────────────────────────────────
 * BATCH QUOTE FETCH
 * ────────────────────────────────────────────────────────────── */

async function batchQuote(instruments, mode = 'LTP') {
    const BATCH = 50;
    const results = {};

    for (let i = 0; i < instruments.length; i += BATCH) {
        const batch = instruments.slice(i, i + BATCH);

        try {
            const data = await retry(() =>
                withTimeout(
                    client.getQuote(batch, mode),
                    7000
                )
            );

            if (!data) {
                console.warn('[Quote] Null response');
                continue;
            }

            const fetched = data.fetched || [];

            fetched.forEach(q => {
                const tok = tokenKey(
                    q.symbolToken ??
                    q.symboltoken ??
                    q.token
                );

                if (tok) {
                    results[tok] = q;
                }
            });

            console.log(
                `[Quote] Batch ${Math.floor(i / BATCH) + 1} ` +
                `→ ${fetched.length}/${batch.length}`
            );

        } catch (err) {
            console.error('[Quote] Batch fetch error:', err.message);
        }
    }

    return results;
}

/* ──────────────────────────────────────────────────────────────
 * HEALTH ROUTE
 * ────────────────────────────────────────────────────────────── */

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: client.isTokenValid() ? 'LIVE' : 'MOCK',
        uptime: process.uptime()
    });
});

/* ──────────────────────────────────────────────────────────────
 * AUTH STATUS
 * ────────────────────────────────────────────────────────────── */

app.get('/api/auth/status', (req, res) => {
    const connected = client.isTokenValid();

    res.json({
        connected,
        mode: connected ? 'LIVE' : 'MOCK',
        clientId: connected ? clientId : null
    });
});

/* ──────────────────────────────────────────────────────────────
 * MANUAL LOGIN
 * ────────────────────────────────────────────────────────────── */

app.post('/api/auth/login', async (req, res) => {
    try {
        await autoLogin();

        res.json({
            success: client.isTokenValid(),
            connected: client.isTokenValid(),
            mode: client.isTokenValid() ? 'LIVE' : 'MOCK'
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/* ──────────────────────────────────────────────────────────────
 * SPOT PRICES
 * POST /api/instruments/spot
 * Body: { symbols: ['NIFTY', 'BANKNIFTY', ...] }
 * Returns: { spotPrices: { NIFTY: 24500, ... } }
 * ────────────────────────────────────────────────────────────── */

app.post('/api/instruments/spot', async (req, res) => {
    try {
        const symbols = Array.isArray(req.body.symbols) ? req.body.symbols : [];

        if (!client.isTokenValid()) {
            return res.json({ spotPrices: {}, mode: 'MOCK' });
        }

        // Build instrument list for index tokens
        const instruments = symbols
            .map(sym => instrumentUtils.getCashToken(sym))
            .filter(Boolean);

        if (instruments.length === 0) {
            return res.json({ spotPrices: {}, mode: 'LIVE' });
        }

        const quotes = await batchQuote(instruments, 'LTP');
        const spotPrices = {};

        symbols.forEach(sym => {
            const tok = instrumentUtils.getCashToken(sym);
            if (!tok) return;
            const key = tokenKey(tok.symboltoken);
            const q = quotes[key];
            if (q) spotPrices[sym] = parseFloat(q.ltp ?? q.close ?? 0);
        });

        res.json({ spotPrices, mode: 'LIVE' });

    } catch (err) {
        console.error('[Spot] Error:', err.message);
        res.status(500).json({ error: err.message, spotPrices: {} });
    }
});

/* ──────────────────────────────────────────────────────────────
 * OPTION CHAINS
 * POST /api/instruments/options
 * Body: { symbols: ['NIFTY', 'BANKNIFTY', ...], expiry: '27JUN2024' (optional) }
 * Returns: { options: [...], expiries: [...] }
 * ────────────────────────────────────────────────────────────── */

app.post('/api/instruments/options', async (req, res) => {
    try {
        const symbols = Array.isArray(req.body.symbols) ? req.body.symbols : [];
        const expiry  = req.body.expiry || null;

        if (!client.isTokenValid()) {
            console.warn('[Options] Not authenticated — returning MOCK');
            return res.json({ options: [], expiries: [], mode: 'MOCK' });
        }

        // Guard: scrip master must be loaded
        const cacheStatus = instrumentUtils.getCacheStatus();
        if (!cacheStatus.loaded) {
            console.warn('[Options] Scrip master not yet loaded — returning empty');
            return res.json({ options: [], expiries: [], mode: 'LOADING' });
        }

        console.log(`[Options] Request: symbols=${symbols.join(',')} expiry=${expiry || 'auto'}`);

        const allOptions = [];

        // ── Step 1: Fetch spot prices (underlying indices/stocks only) ─────────────
        const spotInstruments = symbols
            .map(sym => instrumentUtils.getCashToken(sym))
            .filter(Boolean);

        let spotQuotes = {};
        if (spotInstruments.length > 0) {
            spotQuotes = await batchQuote(spotInstruments, 'LTP') || {};
        }

        const spotPrices = {};
        for (const sym of symbols) {
            const tok = instrumentUtils.getCashToken(sym);
            if (!tok) {
                console.warn(`[Options] No cash token for "${sym}" — cannot fetch spot`);
                continue;
            }
            const key = tokenKey(tok.symboltoken);
            const q   = spotQuotes[key];
            
            let ltp = q ? parseFloat(q.ltp ?? q.close ?? 0) : 0;
            
            // Fallback for indices (batchQuote sometimes returns 0 or empty for indices)
            if (ltp === 0) {
                const ltpData = await client.getLtpData(tok.exchange, tok.tradingsymbol, tok.symboltoken);
                if (ltpData && ltpData.ltp > 0) {
                    ltp = parseFloat(ltpData.ltp);
                }
            }

            if (ltp > 0) {
                spotPrices[sym] = ltp;
                console.log(`[Options][SPOT] ${sym} → token=${tok.symboltoken} exchange=${tok.exchange} LTP=${spotPrices[sym]}`);
            } else {
                console.warn(`[Options][SPOT] ${sym} → token=${tok.symboltoken} — no quote returned (key="${key}")`);
            }
        }

        // ── Step 2: Build option chain from scrip master ───────────────────────────
        const optionTokensToFetch = [];
        const tokenToContractMap  = {};
        const availableExpiriesSet = new Set();

        for (const symbol of symbols) {
            const spot = spotPrices[symbol] || 0;

            if (spot === 0) {
                console.warn(`[Options] ${symbol}: spot=0, skipping option chain`);
                continue;
            }

            const mapping = instrumentUtils.generateOptionChainMapping(symbol, expiry, spot, 5);

            if (mapping.error) {
                console.warn(`[Options] generateOptionChainMapping error for ${symbol}: ${mapping.error}`);
                continue;
            }

            if (mapping.allExpiries) {
                mapping.allExpiries.forEach(e => availableExpiriesSet.add(e));
            }

            console.log(`[Options] ${symbol} | spot=${spot} | ATM=${mapping.atmStrike} | expiry=${mapping.expiry} | contracts=${mapping.chain.length}`);

            for (const contract of mapping.chain) {
                const instrObj = {
                    exchange:    contract.exch_seg,
                    symboltoken: contract.token
                };
                optionTokensToFetch.push(instrObj);
                tokenToContractMap[tokenKey(contract.token)] = {
                    ...contract,
                    spotPrice: spot
                };
            }
        }

        // ── Step 3: Fetch real-time LTP/OI/Volume for all option tokens ───────────
        let optionQuotes = {};
        if (optionTokensToFetch.length > 0) {
            console.log(`[Options] Fetching quotes for ${optionTokensToFetch.length} contracts...`);
            optionQuotes = await batchQuote(optionTokensToFetch, 'FULL') || {};
            console.log(`[Options] Received quotes for ${Object.keys(optionQuotes).length} tokens`);
        }

        // ── Step 4: Assemble final option records ─────────────────────────────────
        for (const instr of optionTokensToFetch) {
            const key      = tokenKey(instr.symboltoken);
            const q        = optionQuotes[key];
            const contract = tokenToContractMap[key];

            if (!contract) continue;

            // Debug every contract
            if (q) {
                const ltp = parseFloat(q.ltp ?? 0);
                console.log(
                    `[Options][CONTRACT] ${contract.underlying} | expiry=${contract.expiry}` +
                    ` | strike=${contract.strike} | type=${contract.type}` +
                    ` | token=${contract.token} | LTP=${ltp}` +
                    ` | OI=${q.opnInterest ?? 0} | Vol=${q.volume ?? 0}` +
                    ` | spot=${contract.spotPrice} | sym=${contract.symbol}`
                );
            } else {
                console.warn(
                    `[Options][MISS] ${contract.underlying} ${contract.strike} ${contract.type}` +
                    ` token=${contract.token} — no quote (key="${key}")`
                );
            }

            const price     = q ? parseFloat(q.ltp     ?? 0) : 0;
            const prevPrice = q ? parseFloat(q.close    ?? price) : price;
            const oi        = q ? parseInt(q.opnInterest ?? 0, 10) : 0;
            const prevOi    = q ? parseInt(q.lowerCircuit ?? 0, 10) : 0;   // Angel One doesn't expose prev OI directly
            const volume    = q ? parseInt(q.volume     ?? 0, 10) : 0;
            const iv        = q ? parseFloat(q.impliedVol ?? 0) : 0;

            allOptions.push({
                id:        `${contract.underlying}_${contract.strike}_${contract.type}`,
                symbol:    contract.underlying,
                strike:    contract.strike,
                type:      contract.type,
                expiry:    contract.expiry,
                spot:      contract.spotPrice,
                price,
                prevPrice,
                volume,
                avgVol:    volume > 0 ? Math.round(volume * 0.8) : 0,  // Estimated avg (5-day fetch is too slow inline)
                oi,
                prevOi:    oi > 0 ? Math.round(oi * 0.97) : 0,         // Estimate prev OI — no direct API field
                iv
            });
        }

        console.log(`[Options] Returning ${allOptions.length} contracts`);

        res.json({
            options:  allOptions,
            expiries: Array.from(availableExpiriesSet)
                .sort((a, b) => {
                    const MONTHS = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
                    const parse = s => { const m = s.match(/^(\d{2})([A-Z]{3})(\d{4})$/); return m ? new Date(+m[3], MONTHS[m[2]]??0, +m[1]) : new Date(0); };
                    return parse(a) - parse(b);
                }),
            mode: 'LIVE'
        });

    } catch (err) {
        console.error('[Options] Unhandled error:', err.message, err.stack);
        res.status(500).json({ error: err.message, options: [], expiries: [] });
    }
});

/* ──────────────────────────────────────────────────────────────
 * DEBUG: Validate a single contract
 * GET /api/debug/validate?sym=NIFTY&expiry=26JUN2025&strike=24500&type=CE
 * ────────────────────────────────────────────────────────────── */

app.get('/api/debug/validate', async (req, res) => {
    const { sym, expiry, strike, type } = req.query;
    const info = instrumentUtils.getContractDebugInfo(
        sym   || 'NIFTY',
        expiry || null,
        parseFloat(strike || 24500),
        type  || 'CE'
    );

    let liveQuote = null;
    if (info.contract && client.isTokenValid()) {
        const q = await batchQuote([{
            exchange:    info.contract.exch_seg,
            symboltoken: info.contract.token
        }], 'FULL');
        liveQuote = q[tokenKey(info.contract.token)] || null;
    }

    const spot = instrumentUtils.getCashToken(sym || 'NIFTY');

    res.json({ info, liveQuote, cashToken: spot });
});

/* ──────────────────────────────────────────────────────────────
 * DEBUG: Cache status
 * GET /api/debug/cache
 * ────────────────────────────────────────────────────────────── */

app.get('/api/debug/cache', (req, res) => {
    res.json(instrumentUtils.getCacheStatus());
});

/* ──────────────────────────────────────────────────────────────
 * 5-SESSION AVERAGE VOLUME
 * POST /api/instruments/avgvol
 * Body: { symbols: ['NIFTY', 'BANKNIFTY', ...] }
 * Returns: { avgVols: { 'NIFTY_24500_CE': 15000, ... } }
 * ────────────────────────────────────────────────────────────── */

app.post('/api/instruments/avgvol', async (req, res) => {
    try {
        const symbols = Array.isArray(req.body.symbols) ? req.body.symbols : [];

        if (!client.isTokenValid()) {
            return res.json({ avgVols: {}, mode: 'MOCK' });
        }

        const avgVols = {};

        // For each symbol, MOCK average volume for now to prevent backend throttling
        // Real implementation would use historical db or cached tick data, 
        // as getCandleData for 11 strikes * 2 types * symbols takes too long synchronously.
        for (const symbol of symbols) {
            // we will let frontend mock the 5 session average volume.
        }

        res.json({ avgVols, mode: 'LIVE', count: 0 });

    } catch (err) {
        console.error('[AvgVol] Error:', err.message);
        res.status(500).json({ error: err.message, avgVols: {} });
    }
});

/* ──────────────────────────────────────────────────────────────
 * HEALTHY ROOT ROUTE FOR RENDER
 * ────────────────────────────────────────────────────────────── */

app.get('/', (req, res) => {
    res.send('✅ AntiGravity Backend Running');
});


/* ──────────────────────────────────────────────────────────────
 * START SERVER IMMEDIATELY
 * IMPORTANT FOR RENDER HEALTH CHECKS
 * ────────────────────────────────────────────────────────────── */

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 AntiGravity Backend Started');
    console.log(`🌐 Listening on port ${PORT}`);
    console.log(`🔗 http://0.0.0.0:${PORT}`);
    console.log('');
});

/* ──────────────────────────────────────────────────────────────
 * BACKGROUND INITIALIZATION
 * Does NOT block server startup
 * ────────────────────────────────────────────────────────────── */

(async () => {
    try {
        console.log('[Init] Loading scrip master...');

        await instrumentUtils.fetchAndCacheScripMaster();

        console.log('[Init] ✅ Scrip master loaded');

        // Daily refresh
        setInterval(() => {
            instrumentUtils.fetchAndCacheScripMaster()
                .catch(err => {
                    console.error(
                        '[Init] Scrip refresh failed:',
                        err.message
                    );
                });
        }, 24 * 60 * 60 * 1000);

        // Initial login
        await autoLogin();

        // Refresh auth every 5.5h
        setInterval(() => {
            autoLogin()
                .catch(err => {
                    console.error(
                        '[Auth] Scheduled login failed:',
                        err.message
                    );
                });
        }, 5.5 * 60 * 60 * 1000);

    } catch (err) {
        console.error('[Init] Fatal startup error:', err);

        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
})();

/* ──────────────────────────────────────────────────────────────
 * GRACEFUL SHUTDOWN
 * ────────────────────────────────────────────────────────────── */

process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Server] SIGINT received');
    process.exit(0);
});

process.on('unhandledRejection', err => {
    console.error('[UnhandledRejection]', err);
});

process.on('uncaughtException', err => {
    console.error('[UncaughtException]', err);
});
