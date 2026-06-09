// market.js

import { state } from './state.js';
import { SmartApiService } from './smartapi.js';

export const ALL_FNO_SYMBOLS = [
    'NIFTY',
    'BANKNIFTY',
    'RELIANCE',
    'SBIN',
    'INFY',
    'TCS'
];

// Default spot prices for mock mode
const MOCK_SPOTS = {
    NIFTY:     24500,
    BANKNIFTY: 52000,
    RELIANCE:   2950,
    SBIN:        820,
    INFY:       1480,
    TCS:        3800
};

export async function generateInitialData() {
    state.marketData = [];

    if (state.apiConnected) {
        await SmartApiService.refreshSpotPrices(state.selectedUniverse);
    }

    state.selectedUniverse.forEach(symbol => {
        const spot = SmartApiService.getLiveSpot(symbol) || MOCK_SPOTS[symbol] || 1000;
        const strikeStep = symbol === 'NIFTY' || symbol === 'BANKNIFTY' ? 50 : 20;

        for (let i = -5; i <= 5; i++) {
            const strike = Math.round(spot / strikeStep) * strikeStep + (i * strikeStep);

            // CE entry
            state.marketData.push({
                id:        `${symbol}_${strike}_CE`,
                symbol,
                strike,
                type:      'CE',
                expiry:    'WEEK1',
                spot,
                price:     Math.max(1, Math.round((spot - strike + 200 + Math.random() * 50) * 10) / 10),
                prevPrice: Math.max(1, Math.round((spot - strike + 195 + Math.random() * 50) * 10) / 10),
                oi:        Math.floor(10000 + Math.random() * 50000),
                prevOi:    Math.floor(8000  + Math.random() * 45000),
                volume:    Math.floor(3000  + Math.random() * 15000),
                avgVol:    Math.floor(2000  + Math.random() * 8000),
                iv:        Math.round(15 + Math.random() * 20)
            });

            // PE entry
            state.marketData.push({
                id:        `${symbol}_${strike}_PE`,
                symbol,
                strike,
                type:      'PE',
                expiry:    'WEEK1',
                spot,
                price:     Math.max(1, Math.round((strike - spot + 200 + Math.random() * 50) * 10) / 10),
                prevPrice: Math.max(1, Math.round((strike - spot + 195 + Math.random() * 50) * 10) / 10),
                oi:        Math.floor(10000 + Math.random() * 50000),
                prevOi:    Math.floor(8000  + Math.random() * 45000),
                volume:    Math.floor(3000  + Math.random() * 15000),
                avgVol:    Math.floor(2000  + Math.random() * 8000),
                iv:        Math.round(15 + Math.random() * 20)
            });
        }
    });
}

// Exported init function expected by root app.js
export async function initMarket() {
    await generateInitialData();
}
