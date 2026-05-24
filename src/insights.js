// insights.js

import { state } from './state.js';
import { calculateMetrics } from './analytics.js';

export function openInsights(id) {

    state.currentInsightId = id;

    const opt =
        state.marketData.find(
            m => m.id === id
        );

    if (!opt) return;

    const data =
        calculateMetrics(opt);

    document.getElementById(
        'insight-title'
    ).textContent =
        `${data.symbol} ${data.strike}`;
}
