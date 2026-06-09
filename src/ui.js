// ui.js - All UI rendering helpers (no login logic - handled in root app.js)

import { state } from './state.js';
import { calculateMetrics } from './analytics.js';
import { applyFilters } from './filters.js';
import { openInsights } from './insights.js';

// Expose insights globally so table row onclick works
window.openInsights = openInsights;

export function initUI() {
    // Nothing needed here - login is handled in root app.js
}

export function renderDashboard() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    let processed = state.marketData.map(calculateMetrics);
    processed = applyFilters(processed);

    if (processed.length === 0) {
        tableBody.innerHTML = '<tr class="loading-row"><td colspan="14">No data. Select symbols from Universe filter.</td></tr>';
        return;
    }

    let html = '';
    processed.forEach(d => {
        const oiClass  = d.oiChgPct >= 0 ? 'text-bullish' : 'text-bearish';
        const typeClass = d.type === 'CE' ? 'text-bullish' : 'text-bearish';
        const spread   = (d.price - d.prevPrice).toFixed(2);

        html += `
          <tr onclick="window.openInsights('${d.id}')">
            <td>${d.symbol}</td>
            <td>${d.expiry || 'WEEK1'}</td>
            <td class="${typeClass}">${d.type}</td>
            <td>${d.strike}</td>
            <td>${d.spot ? d.spot.toFixed(0) : '-'}</td>
            <td>₹${d.price}</td>
            <td>${(d.volume / 1000).toFixed(1)}K</td>
            <td>${(d.avgVol / 1000).toFixed(1)}K</td>
            <td>${d.volRatio.toFixed(1)}x</td>
            <td>${(d.oi / 1000).toFixed(1)}K</td>
            <td class="${oiClass}">${d.oiChgPct.toFixed(1)}%</td>
            <td>${d.iv || '-'}%</td>
            <td>${spread}</td>
            <td>
              <span class="signal-tag ${d.signalClass || ''}">${d.signal}</span>
            </td>
          </tr>`;
    });

    tableBody.innerHTML = html;
}
