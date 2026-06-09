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
