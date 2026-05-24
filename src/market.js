// market.js

import { state } from './state.js';
import { SmartApiService } from './smartapi.js';

export const ALL_FNO_SYMBOLS = [
    'NIFTY',
    'BANKNIFTY',
    'RELIANCE',
    'SBIN'
];

export async function generateInitialData() {

    state.marketData = [];

    if (state.apiConnected) {

        await SmartApiService.refreshSpotPrices(
            state.selectedUniverse
        );
    }

    state.selectedUniverse.forEach(symbol => {

        const spot =
            SmartApiService.getLiveSpot(symbol)
            || 1000;

        for (let i = -5; i <= 5; i++) {

            const strike =
                Math.round(spot / 50) * 50 +
                (i * 50);

            state.marketData.push({
                id: `${symbol}_${strike}_CE`,
                symbol,
                strike,
                type: 'CE',
                expiry: 'WEEK1',
                spot,

                price: 100,
                prevPrice: 98,

                oi: 10000,
                prevOi: 9500,

                volume: 5000,
                avgVol: 3000,

                iv: 18
            });
        }
    });
}
