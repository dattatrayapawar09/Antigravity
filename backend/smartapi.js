/**
 * SmartAPI Client — Angel One SmartAPI helper
 * Handles authentication, TOTP generation, and API calls
 */

const axios = require('axios');

// Try to load totp-generator safely
let totp;
try {
    totp = require('totp-generator');
    console.log('[SmartAPI] totp-generator loaded ✓');
} catch (e) {
    console.warn('[SmartAPI] totp-generator NOT found — TOTP will be 000000 (login will fail if TOTP is required)');
    totp = null;
}

const BASE_URL = 'https://apiconnect.angelone.in';

class SmartAPIClient {
    constructor(config) {
        this.apiKey      = config.apiKey;
        this.clientId    = config.clientId;
        this.password    = config.password;
        this.totpSecret  = config.totpSecret;

        this.jwtToken    = null;
        this.feedToken   = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.isDummy     = this._isDummyConfig(config);

        if (this.isDummy) {
            console.warn('[SmartAPI] ⚠️  Credentials incomplete — will run in MOCK mode:');
            if (!config.apiKey)               console.warn('           • ANGEL_API_KEY is missing');
            if (!config.clientId)             console.warn('           • ANGEL_CLIENT_ID is missing');
            if (!config.password)             console.warn('           • ANGEL_PASSWORD is missing');
        } else {
            console.log(`[SmartAPI] ✅ Credentials loaded for client: ${this.clientId}`);
        }
    }

    _isDummyConfig(c) {
        return !c.apiKey     || c.apiKey.startsWith('DUMMY')     ||
               !c.clientId  || c.clientId.startsWith('DUMMY')   ||
               !c.password  || c.password.startsWith('DUMMY');
    }

    _generateTOTP() {
        if (!totp || !this.totpSecret || this.totpSecret.startsWith('DUMMY')) {
            console.warn('[SmartAPI] Generating dummy TOTP 000000 — real TOTP not available');
            return '000000';
        }
        try {
            // totp-generator v0.0.14 API: totp(secret) returns string
            // v1.x API: totp.generate(secret) returns { otp, expires }
            const result = typeof totp === 'function'
                ? totp(this.totpSecret)
                : totp.generate(this.totpSecret);
            const code = typeof result === 'object' ? result.otp : result;
            console.log(`[SmartAPI] TOTP generated: ${code}`);
            return code;
        } catch (err) {
            console.error('[SmartAPI] TOTP generation error:', err.message);
            return '000000';
        }
    }

    _headers(withAuth = false) {
        const h = {
            'Content-Type':        'application/json',
            'Accept':              'application/json',
            'X-UserType':          'USER',
            'X-SourceID':          'WEB',
            'X-ClientLocalIP':     '127.0.0.1',
            'X-ClientPublicIP':    '127.0.0.1',
            'X-MACAddress':        '00:00:00:00:00:00',
            'X-PrivateKey':        this.apiKey,
        };
        if (withAuth && this.jwtToken) {
            h['Authorization'] = `Bearer ${this.jwtToken}`;
        }
        return h;
    }

    isTokenValid() {
        return !!(this.jwtToken && this.tokenExpiry && Date.now() < this.tokenExpiry);
    }

    async login() {
        if (this.isDummy) {
            console.log('[SmartAPI] Dummy credentials — skipping login, staying in MOCK mode');
            return { success: false, reason: 'dummy_credentials' };
        }

        try {
            const totpCode = this._generateTOTP();
            console.log(`[SmartAPI] Attempting login for client: ${this.clientId} with TOTP: ${totpCode}`);

            const res = await axios.post(
                `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
                {
                    clientcode: this.clientId,
                    password:   this.password,
                    totp:       totpCode,
                },
                { headers: this._headers(), timeout: 15000 }
            );

            console.log('[SmartAPI] Login response status:', res.data?.status);
            console.log('[SmartAPI] Login response message:', res.data?.message);

            if (res.data?.status && res.data?.data?.jwtToken) {
                this.jwtToken     = res.data.data.jwtToken;
                this.feedToken    = res.data.data.feedToken;
                this.refreshToken = res.data.data.refreshToken;
                // Tokens expire at midnight IST — cache for 6 hours
                this.tokenExpiry  = Date.now() + (6 * 60 * 60 * 1000);
                console.log('[SmartAPI] ✅ Login successful! LIVE MODE active.');
                return { success: true };
            }

            const msg = res.data?.message || JSON.stringify(res.data) || 'Login failed — no JWT in response';
            console.error('[SmartAPI] ❌ Login failed:', msg);
            return { success: false, reason: msg };

        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            const status = err.response?.status;
            console.error(`[SmartAPI] ❌ Login HTTP error (${status}):`, msg);
            if (err.response?.data) {
                console.error('[SmartAPI] Full error response:', JSON.stringify(err.response.data));
            }
            return { success: false, reason: msg };
        }
    }

    async ensureAuthenticated() {
        if (!this.isTokenValid()) {
            return await this.login();
        }
        return { success: true };
    }

    /**
     * Get market quotes for a list of instruments
     * @param {Array} instruments - [{ exchange: 'NSE', tradingsymbol: 'NIFTY', symboltoken: '26000' }]
     * @param {string} mode - 'LTP' | 'OHLC' | 'FULL'
     */
    async getQuote(instruments, mode = 'FULL') {
        const authResult = await this.ensureAuthenticated();
        if (!authResult.success) return null;

        try {
            const res = await axios.post(
                `${BASE_URL}/rest/secure/angelbroking/market/v1/quote/`,
                { mode, exchangeTokens: this._groupByExchange(instruments) },
                { headers: this._headers(true), timeout: 8000 }
            );
            return res.data?.data || null;
        } catch (err) {
            console.error('[SmartAPI] Quote error:', err.response?.data?.message || err.message);
            return null;
        }
    }

    async getLtpData(exchange, tradingsymbol, symboltoken) {
        const authResult = await this.ensureAuthenticated();
        if (!authResult.success) return null;

        try {
            const res = await axios.post(
                `${BASE_URL}/rest/secure/angelbroking/order/v1/getLtpData`,
                { exchange, tradingsymbol, symboltoken },
                { headers: this._headers(true), timeout: 5000 }
            );
            return res.data?.data || null;
        } catch (err) {
            console.error('[SmartAPI] LTP error:', err.response?.data?.message || err.message);
            return null;
        }
    }

    /**
     * Get option chain for a symbol
     */
    async getOptionChain(symbol, expiryDate, strikePrice) {
        const authResult = await this.ensureAuthenticated();
        if (!authResult.success) return null;

        try {
            const res = await axios.post(
                `${BASE_URL}/rest/secure/angelbroking/derivatives/v1/optionchain`,
                { name: symbol, expirydate: expiryDate, strikePrice, optionType: 'CE PE' },
                { headers: this._headers(true), timeout: 10000 }
            );
            return res.data?.data || null;
        } catch (err) {
            console.error('[SmartAPI] OptionChain error:', err.response?.data?.message || err.message);
            return null;
        }
    }

    _groupByExchange(instruments) {
        const grouped = {};
        instruments.forEach(({ exchange, symboltoken }) => {
            if (!grouped[exchange]) grouped[exchange] = [];
            grouped[exchange].push(symboltoken);
        });
        return grouped;
    }
}

module.exports = SmartAPIClient;
