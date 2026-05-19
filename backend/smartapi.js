/**
 * SmartAPI Client — Angel One SmartAPI helper
 * Handles authentication, TOTP generation, and API calls
 */

const axios = require('axios');

// Try to load totp-generator safely
let totp;
try {
    totp = require('totp-generator');
} catch (e) {
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
    }

    _isDummyConfig(c) {
        return !c.apiKey || c.apiKey.startsWith('DUMMY') ||
               !c.clientId || c.clientId.startsWith('DUMMY') ||
               !c.password || c.password.startsWith('DUMMY');
    }

    _generateTOTP() {
        if (!totp || !this.totpSecret || this.totpSecret.startsWith('DUMMY')) {
            return '000000';
        }
        try {
            // totp-generator v0.0.14 API
            const result = typeof totp === 'function'
                ? totp(this.totpSecret)
                : totp.generate(this.totpSecret);
            return typeof result === 'object' ? result.otp : result;
        } catch {
            return '000000';
        }
    }

    _headers(withAuth = false) {
        const h = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-PrivateKey': this.apiKey,
        };
        if (withAuth && this.jwtToken) {
            h['Authorization'] = `Bearer ${this.jwtToken}`;
        }
        return h;
    }

    isTokenValid() {
        return this.jwtToken && this.tokenExpiry && Date.now() < this.tokenExpiry;
    }

    async login() {
        if (this.isDummy) {
            console.log('[SmartAPI] Dummy credentials detected — running in MOCK mode');
            return { success: false, reason: 'dummy_credentials' };
        }

        try {
            const totpCode = this._generateTOTP();
            const res = await axios.post(
                `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
                {
                    clientcode: this.clientId,
                    password:   this.password,
                    totp:       totpCode,
                },
                { headers: this._headers(), timeout: 10000 }
            );

            if (res.data?.status && res.data?.data?.jwtToken) {
                this.jwtToken     = res.data.data.jwtToken;
                this.feedToken    = res.data.data.feedToken;
                this.refreshToken = res.data.data.refreshToken;
                // Tokens expire at midnight IST — cache for 6 hours
                this.tokenExpiry  = Date.now() + (6 * 60 * 60 * 1000);
                console.log('[SmartAPI] Login successful ✓');
                return { success: true };
            }

            const msg = res.data?.message || 'Login failed';
            console.error('[SmartAPI] Login failed:', msg);
            return { success: false, reason: msg };

        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error('[SmartAPI] Login error:', msg);
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

    /**
     * Get option chain for a symbol (available in newer API)
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
