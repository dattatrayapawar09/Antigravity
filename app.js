// app.js - root entry point loaded by index.html
// This re-uses all logic from src/app.js

import { state } from './src/state.js';
import { generateInitialData, ALL_FNO_SYMBOLS } from './src/market.js';
import { SmartApiService } from './src/smartapi.js';

const VALID_PASSWORD = 'datta@7020083825';

// ── Dashboard Renderer ──────────────────────────────────────────────────────
function renderDashboard() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    const data = state.marketData;
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr class="loading-row"><td colspan="14">No data available. Select symbols and wait for data to load.</td></tr>';
        return;
    }

    let html = '';
    data.forEach(d => {
        const priceChg = d.price - d.prevPrice;
        const oiChg = d.oi - d.prevOi;
        const oiChgPct = d.prevOi > 0 ? ((oiChg / d.prevOi) * 100).toFixed(1) : '0.0';
        const safeAvgVol = d.avgVol > 0 ? d.avgVol : Math.max(1, d.volume || 1);
        const volRatio = (d.volume / safeAvgVol).toFixed(1);

        let signal = 'Neutral';
        if (d.type === 'CE' && oiChg > 0 && parseFloat(volRatio) > 1.5 && priceChg > 0) {
            signal = '🟢 Bullish Buildup';
        } else if (d.type === 'PE' && oiChg > 0 && parseFloat(volRatio) > 1.5 && priceChg > 0) {
            signal = '🔴 Bearish Buildup';
        }

        const spread = (d.price - d.prevPrice).toFixed(2);
        const strength = Math.min(100, (parseFloat(volRatio) * 10) + (Math.abs(parseFloat(oiChgPct)) * 2)).toFixed(0);

        html += `
          <tr onclick="window.openInsights && window.openInsights('${d.id}')">
            <td>${d.symbol}</td>
            <td>${d.expiry || 'WEEK1'}</td>
            <td class="${d.type === 'CE' ? 'text-bullish' : 'text-bearish'}">${d.type}</td>
            <td>${d.strike}</td>
            <td>${d.spot ? d.spot.toFixed(0) : '-'}</td>
            <td>₹${d.price}</td>
            <td>${(d.volume / 1000).toFixed(1)}K</td>
            <td>${(d.avgVol / 1000).toFixed(1)}K</td>
            <td>${volRatio}x</td>
            <td>${(d.oi / 1000).toFixed(1)}K</td>
            <td class="${oiChg > 0 ? 'text-bullish' : 'text-bearish'}">${oiChgPct}%</td>
            <td>${d.iv || '-'}%</td>
            <td>${spread}</td>
            <td>
              <div class="signal-bar-wrap">
                <div class="signal-bar" style="width:${strength}%"></div>
                <span>${signal}</span>
              </div>
            </td>
          </tr>`;
    });

    tableBody.innerHTML = html;
}

// ── Login / Unlock ──────────────────────────────────────────────────────────
function setupLogin() {
    const loginOverlay = document.getElementById('app-login');
    const passwordInput = document.getElementById('app-password');
    const loginButton  = document.getElementById('btn-login');
    const errorMsg     = document.getElementById('login-error');

    function unlock() {
        const pwd = (passwordInput.value || '').trim();
        if (!pwd || pwd === VALID_PASSWORD) {
            loginOverlay.style.display   = 'none';
            document.getElementById('main-app-container').style.display = 'block';
            errorMsg.style.display = 'none';
        } else {
            errorMsg.style.display = 'block';
        }
    }

    loginButton.addEventListener('click', unlock);
    passwordInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') unlock();
    });
}

// ── Market Data Init ────────────────────────────────────────────────────────
async function initApp() {
    // Set default universe
    state.selectedUniverse = [...ALL_FNO_SYMBOLS];

    // Check SmartAPI connection (fails gracefully → mock mode)
    await SmartApiService.checkStatus();

    // Generate initial mock/live data
    await generateInitialData();

    // First render
    renderDashboard();

    // Poll every 5s
    setInterval(async () => {
        if (state.apiConnected) {
            await SmartApiService.refreshSpotPrices(state.selectedUniverse);
            await generateInitialData();
        }
        renderDashboard();
    }, 5000);
}

// ── Init on Load ────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    initApp();
    // initialise Lucide icons
    if (window.lucide) window.lucide.createIcons();
});
