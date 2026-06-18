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

function isMarketLive() {
    const now = new Date();
    // Convert to IST
    const istOffset = 330 * 60000;
    const nowIST = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    const day = nowIST.getDay();
    const hours = nowIST.getHours();
    const mins = nowIST.getMinutes();
    
    if (day === 0 || day === 6) return false;
    
    const timeInMins = hours * 60 + mins;
    return timeInMins >= 9 * 60 + 15 && timeInMins <= 15 * 60 + 30;
}

export function renderDashboard() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    let processed = state.marketData.map(calculateMetrics);
    processed = applyFilters(processed);
    processed.sort(
        (a, b) => b.volRatio - a.volRatio
    );
    
    // Top 50 volume surge contracts
    processed = processed.slice(0, 50);

    if (processed.length === 0) {
        tableBody.innerHTML = '<tr class="loading-row"><td colspan="14">No data. Select symbols from Universe filter.</td></tr>';
        return;
    }

    const live = isMarketLive();
    
    // Update headers based on market status
    const thCurVol = document.getElementById('th-cur-vol');
    const thAvgVol = document.getElementById('th-avg-vol');
    const thRatio  = document.getElementById('th-ratio');
    const thOi     = document.getElementById('th-oi');
    const thIv     = document.getElementById('th-iv');
    
    if (thCurVol) thCurVol.textContent = live ? 'Cur Vol' : 'Last Session Vol';
    if (thAvgVol) thAvgVol.textContent = live ? 'Avg Vol' : 'Last 5 Avg Vol';
    if (thRatio)  thRatio.textContent  = live ? 'Ratio' : 'Last Session Ratio';
    if (thOi)     thOi.textContent     = live ? 'OI' : 'Last Session OI';
    if (thIv)     thIv.textContent     = live ? 'IV' : 'Last Session IV';

    let html = '';
    processed.forEach(d => {
        const oiClass  = d.oiChgPct >= 0 ? 'text-bullish' : 'text-bearish';
        const typeClass = d.type === 'CE' ? 'text-bullish' : 'text-bearish';
        const spread   = (d.price - d.prevPrice).toFixed(2);
        
        let tooltipHtml = '';
      if (
    Array.isArray(d.historicalVolumes) &&
    d.historicalVolumes.length > 0
) {
tooltipHtml = `
<div class="tooltip-popup glass-panel">
    <strong>Previous 5 Sessions</strong><br>
    ${d.historicalVolumes
        .map(v => `${(v / 1000).toFixed(1)}K`)
        .join('<br>')}
</div>`;
        }

        const displayVol = live
    ? (d.volume || 0)
    : (d.previousSessionVolume || d.volume || 0);
        const displayRatio =
    d.avgVol > 0
        ? displayVol / d.avgVol
        : 0;
        
        // For non-live, we assume OI/IV are relatively static from the last session
        const displayOi = d.oi;
        const displayIv = d.iv;

        html += `
          <tr onclick="window.openInsights('${d.id}')">
            <td>${d.symbol}</td>
            <td>${d.expiry || 'WEEK1'}</td>
            <td class="${typeClass}">${d.type}</td>
            <td>${d.strike}</td>
            <td>${d.spot ? d.spot.toFixed(0) : '-'}</td>
            <td>₹${d.price}</td>
            <td>${(displayVol / 1000).toFixed(1)}K</td>
            <td class="tooltip-container">
                ${(d.avgVol / 1000).toFixed(1)}K
                ${tooltipHtml}
            </td>
            <td>${displayRatio.toFixed(1)}x</td>
            <td>${(displayOi / 1000).toFixed(1)}K</td>
            <td class="${oiClass}">${d.oiChgPct.toFixed(1)}%</td>
            <td>${displayIv || '-'}%</td>
            <td>${spread}</td>
            <td>
              <span class="signal-tag ${d.signalClass || ''}">${d.signal}</span>
            </td>
          </tr>`;
    });

    tableBody.innerHTML = html;
}
