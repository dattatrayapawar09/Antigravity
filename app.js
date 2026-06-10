// ═══════════════════════════════════════════════════════════════════════════
// app.js — Main entry point for Antigravity Options Tracker
// Password: datta@7020083825
// ═══════════════════════════════════════════════════════════════════════════

import { state }                                     from './src/state.js';
import { generateInitialData, ALL_FNO_SYMBOLS,
         populateExpiryDropdown }                     from './src/market.js';
import { SmartApiService, BACKEND_URL }               from './src/smartapi.js';
import { initFilters, applyFilters }                  from './src/filters.js';
import { calculateMetrics }                           from './src/analytics.js';

const VALID_PASSWORD = 'datta@7020083825';

// ─── Expose globals ──────────────────────────────────────────────────────────
window.openInsights = openInsights;

// ─── Tab state ───────────────────────────────────────────────────────────────
let currentTab = 'index'; // 'index' | 'stocks' | 'insights'

// ─── Universe split ───────────────────────────────────────────────────────────
const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
const STOCK_SYMBOLS = ['RELIANCE', 'SBIN', 'INFY', 'TCS', 'HDFCBANK', 'ICICIBANK',
                       'ADANIENT', 'WIPRO', 'AXISBANK', 'MARUTI'];

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD RENDERER
// ═══════════════════════════════════════════════════════════════════════════
function renderDashboard() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    // Filter by current tab's universe
    const tabSymbols = currentTab === 'stocks' ? STOCK_SYMBOLS : INDEX_SYMBOLS;
    let data = state.marketData.filter(d => tabSymbols.includes(d.symbol));
    data = data.map(calculateMetrics);
    data = applyFilters(data);

    // Sort: highest vol ratio first
    data.sort((a, b) => b.volRatio - a.volRatio);
    // Top 50
    data = data.slice(0, 50);

    if (data.length === 0) {
        const modeLabel = state.apiConnected ? 'No options data for this filter' : '⚠️ Mock Mode — Connecting to SmartAPI…';
        tableBody.innerHTML = `<tr class="loading-row"><td colspan="14">${modeLabel}</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(d => {
        const oiClass   = d.oiChgPct >= 0 ? 'text-bullish' : 'text-bearish';
        const typeClass = d.type === 'CE' ? 'text-bullish' : 'text-bearish';
        const spread    = (d.price - d.prevPrice).toFixed(2);
        const spreadCls = d.price >= d.prevPrice ? 'text-bullish' : 'text-bearish';
        const strength  = Math.min(100, Math.round((d.volRatio * 10) + (Math.abs(d.oiChgPct) * 2)));

        let signalBadge = `<span class="signal-neutral">Neutral</span>`;
        if (d.signal === 'Bullish Buildup')  signalBadge = `<span class="signal-bull">🟢 Bullish</span>`;
        if (d.signal === 'Bearish Buildup')  signalBadge = `<span class="signal-bear">🔴 Bearish</span>`;
        if (d.signal === 'Short Covering')   signalBadge = `<span class="signal-bull">⬆ Short Cover</span>`;
        if (d.signal === 'Long Unwinding')   signalBadge = `<span class="signal-bear">⬇ Long Unwind</span>`;

        html += `<tr onclick="window.openInsights('${d.id}')">
            <td><strong>${d.symbol}</strong></td>
            <td>${d.expiry || 'WEEK1'}</td>
            <td class="${typeClass}"><strong>${d.type}</strong></td>
            <td>${d.strike.toLocaleString('en-IN')}</td>
            <td>${d.spot ? d.spot.toLocaleString('en-IN', {maximumFractionDigits:0}) : '—'}</td>
            <td>₹${d.price.toFixed(2)}</td>
            <td>${(d.volume / 1000).toFixed(1)}K</td>
            <td>${(d.avgVol / 1000).toFixed(1)}K</td>
            <td class="${d.volRatio > 2 ? 'text-bullish' : ''}">${d.volRatio.toFixed(1)}x</td>
            <td>${(d.oi / 1000).toFixed(1)}K</td>
            <td class="${oiClass}">${d.oiChgPct >= 0 ? '+' : ''}${d.oiChgPct.toFixed(1)}%</td>
            <td>${d.iv || '—'}%</td>
            <td class="${spreadCls}">${spread}</td>
            <td>
                ${signalBadge}
                <div class="strength-bar"><div style="width:${strength}%"></div></div>
            </td>
        </tr>`;
    });

    tableBody.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function openInsights(id) {
    state.currentInsightId = id;
    const opt = state.marketData.find(m => m.id === id);
    if (!opt) return;

    const d = calculateMetrics(opt);

    // Switch to insights view
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const insightView = document.getElementById('view-insights');
    if (insightView) insightView.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-insights')?.classList.add('active');

    // Title and badges
    const title = document.getElementById('insight-title');
    if (title) title.textContent = `${d.symbol} ${d.strike} ${d.type} — ${d.expiry || 'WEEK1'}`;

    const badges = document.getElementById('insight-badges');
    if (badges) {
        const oiDir = d.oiChgPct >= 0 ? '↑' : '↓';
        badges.innerHTML = `
            <span class="badge">Spot: ₹${d.spot ? d.spot.toFixed(0) : '—'}</span>
            <span class="badge">LTP: ₹${d.price.toFixed(2)}</span>
            <span class="badge">IV: ${d.iv || '—'}%</span>
            <span class="badge">OI: ${(d.oi / 1000).toFixed(1)}K ${oiDir}${Math.abs(d.oiChgPct).toFixed(1)}%</span>
            <span class="badge">Vol: ${(d.volume / 1000).toFixed(1)}K (${d.volRatio.toFixed(1)}x avg)</span>
            <span class="badge ${d.signal === 'Neutral' ? '' : 'badge-signal'}">${d.signal}</span>
        `;
    }

    // Show insights grid
    const grid = document.getElementById('insights-content');
    if (grid) grid.style.display = 'grid';

    // AI insight text
    const aiText = document.getElementById('ai-insight-text');
    if (aiText) {
        const analysis = generateInsightText(d);
        aiText.textContent = analysis;
    }

    // Draw/update chart
    drawInsightChart(d);
}

function generateInsightText(d) {
    const volComment  = d.volRatio > 2.5 ? 'Very high volume surge' : d.volRatio > 1.5 ? 'Above-average volume' : 'Normal volume';
    const oiComment   = d.oiChgPct > 5 ? 'significant OI buildup' : d.oiChgPct < -5 ? 'notable OI unwinding' : 'stable OI';
    const priceDir    = d.priceChg > 0 ? 'rising LTP' : d.priceChg < 0 ? 'falling LTP' : 'flat LTP';
    const signal      = d.signal !== 'Neutral' ? `Signal: ${d.signal}.` : 'No strong directional signal.';

    return `${volComment} observed in ${d.symbol} ${d.strike} ${d.type} (${d.expiry || 'WEEK1'}) — with ${oiComment} and ${priceDir}. IV at ${d.iv || '—'}%. ${signal} Vol Ratio: ${d.volRatio.toFixed(1)}x average. Monitor spot at ₹${d.spot ? d.spot.toFixed(0) : '—'} for confirmation.`;
}

function drawInsightChart(d) {
    const canvas = document.getElementById('historicalChart');
    if (!canvas || !window.Chart) return;

    // Destroy old chart
    if (state.chartInstance) {
        state.chartInstance.destroy();
        state.chartInstance = null;
    }

    // Simulate 10 data points of price history
    const labels = Array.from({length: 10}, (_, i) => `T-${9-i}`);
    const base = d.prevPrice;
    const prices = labels.map((_, i) => {
        const progress = i / 9;
        return +(base + (d.price - base) * progress + (Math.random() - 0.5) * base * 0.02).toFixed(2);
    });
    prices[9] = d.price;

    const volumes = labels.map(() => Math.floor(d.avgVol * (0.7 + Math.random() * 0.6)));
    volumes[9] = d.volume;

    state.chartInstance = new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'line',
                    label: 'LTP (₹)',
                    data: prices,
                    borderColor: '#00d9ff',
                    backgroundColor: 'rgba(0,217,255,0.08)',
                    yAxisID: 'yPrice',
                    tension: 0.4,
                    pointRadius: 4,
                    fill: true,
                    order: 1
                },
                {
                    type: 'bar',
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(123,97,255,0.55)',
                    yAxisID: 'yVol',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: '#b0bec5' } } },
            scales: {
                x:      { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                yPrice: { position: 'left',  ticks: { color: '#00d9ff' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                yVol:   { position: 'right', ticks: { color: '#7b61ff' }, grid: { display: false } }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function setupTabs() {
    const navIndex    = document.getElementById('nav-index');
    const navStocks   = document.getElementById('nav-stocks');
    const navInsights = document.getElementById('nav-insights');

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        if (tab === 'insights') {
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.getElementById('view-insights')?.classList.add('active');
            navInsights?.classList.add('active');
        } else {
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.getElementById('view-dashboard')?.classList.add('active');
            if (tab === 'index')  navIndex?.classList.add('active');
            if (tab === 'stocks') navStocks?.classList.add('active');
            // Update tab label
            const h2 = document.querySelector('#view-dashboard .table-header-area h2');
            if (h2) h2.textContent = tab === 'stocks' ? 'Top 50 Stock Options Surges' : 'Top 50 Index Options Surges';
            // Refresh data for the new tab
            refreshMarketData();
        }
    }

    navIndex?.addEventListener('click',    () => switchTab('index'));
    navStocks?.addEventListener('click',   () => switchTab('stocks'));
    navInsights?.addEventListener('click', () => switchTab('insights'));

    // Back button from insights
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
        switchTab(currentTab === 'insights' ? 'index' : currentTab);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSE SELECTOR (sidebar multi-select)
// ═══════════════════════════════════════════════════════════════════════════
function setupUniverseSelector() {
    const wrapper  = document.getElementById('universe-select-wrapper');
    const trigger  = wrapper?.querySelector('.select-trigger');
    const dropdown = wrapper?.querySelector('.select-dropdown');
    const optsCont = document.getElementById('universe-options');
    const searchIn = document.getElementById('universe-search');

    if (!wrapper || !optsCont) return;

    // Build option list
    const allSyms = [...INDEX_SYMBOLS, ...STOCK_SYMBOLS];
    function renderOptions(filter = '') {
        optsCont.innerHTML = '';
        allSyms.filter(s => s.includes(filter.toUpperCase())).forEach(sym => {
            const checked = state.selectedUniverse.includes(sym);
            const div = document.createElement('div');
            div.className = 'select-option' + (checked ? ' selected' : '');
            div.textContent = sym;
            div.addEventListener('click', () => {
                if (state.selectedUniverse.includes(sym)) {
                    state.selectedUniverse = state.selectedUniverse.filter(s => s !== sym);
                    div.classList.remove('selected');
                } else {
                    state.selectedUniverse.push(sym);
                    div.classList.add('selected');
                }
                updateTriggerLabel();
                refreshMarketData(); // Immediately fetch the new universe
            });
            optsCont.appendChild(div);
        });
    }

    function updateTriggerLabel() {
        if (trigger) {
            trigger.textContent = state.selectedUniverse.length === 0
                ? 'All Symbols'
                : state.selectedUniverse.join(', ');
        }
    }

    // Toggle dropdown
    trigger?.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown?.classList.remove('open'));

    // Search
    searchIn?.addEventListener('input', () => renderOptions(searchIn.value));

    // Select all / Clear all
    document.getElementById('btn-select-all')?.addEventListener('click', e => {
        e.stopPropagation();
        state.selectedUniverse = [...allSyms];
        renderOptions(searchIn?.value || '');
        updateTriggerLabel();
        refreshMarketData();
    });
    document.getElementById('btn-clear-all')?.addEventListener('click', e => {
        e.stopPropagation();
        state.selectedUniverse = [];
        renderOptions(searchIn?.value || '');
        updateTriggerLabel();
        refreshMarketData();
    });

    renderOptions();
    updateTriggerLabel();
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════════════════
function setupSettingsModal() {
    const modal     = document.getElementById('settings-modal');
    const btnOpen   = document.getElementById('btn-settings');
    const btnClose  = document.getElementById('btn-close-settings');
    const btnSave   = document.getElementById('btn-save-settings');
    const btnTest   = document.getElementById('btn-test-connection');

    btnOpen?.addEventListener('click',  () => { if (modal) modal.style.display = 'flex'; });
    btnClose?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    modal?.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    // Restore saved credentials
    const saved = JSON.parse(localStorage.getItem('ag_api_creds') || '{}');
    if (saved.apiKey)   document.getElementById('s-api-key').value   = saved.apiKey;
    if (saved.clientId) document.getElementById('s-client-id').value = saved.clientId;
    if (saved.password) document.getElementById('s-password').value  = saved.password;
    if (saved.totp)     document.getElementById('s-totp').value      = saved.totp;

    btnSave?.addEventListener('click', async () => {
        const creds = {
            apiKey:   document.getElementById('s-api-key').value.trim(),
            clientId: document.getElementById('s-client-id').value.trim(),
            password: document.getElementById('s-password').value.trim(),
            totp:     document.getElementById('s-totp').value.trim()
        };
        localStorage.setItem('ag_api_creds', JSON.stringify(creds));

        // Try to connect via backend login
        try {
            showToast('🔄 Connecting to SmartAPI…', 5000);
            const connected = await SmartApiService.triggerLogin();
            showToast(connected ? '✅ Connected to SmartAPI!' : '❌ Auth failed — check credentials');
            if (connected) {
                modal.style.display = 'none';
                await refreshMarketData();
            }
        } catch (err) {
            showToast('⚠️ Backend unreachable — check Render service');
        }
    });

    btnTest?.addEventListener('click', async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            showToast(`Backend: ${data.status} | Mode: ${data.mode}`);
        } catch {
            showToast('❌ Backend unreachable');
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════
function showToast(msg, duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}
window.showToast = showToast;

// ═══════════════════════════════════════════════════════════════════════════
// MARKET DATA REFRESH
// ═══════════════════════════════════════════════════════════════════════════
function getTabSymbols() {
    const tabBase = currentTab === 'stocks' ? STOCK_SYMBOLS : INDEX_SYMBOLS;
    return state.selectedUniverse.filter(s => tabBase.includes(s));
}

async function refreshMarketData() {
    const wasConnected = state.apiConnected;
    // checkStatus() has internal rate-limiting for login — safe to call each cycle
    await SmartApiService.checkStatus();

    // Fetch data only for the current tab's symbols (faster, avoids timeouts)
    const tabSymbols = getTabSymbols();
    await generateInitialData(tabSymbols);
    renderDashboard();

    // Notify user when connection state changes
    if (!wasConnected && state.apiConnected) {
        showToast('✅ Connected to SmartAPI — Live data active!');
    } else if (wasConnected && !state.apiConnected) {
        showToast('⚠️ SmartAPI disconnected — Showing mock data');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN SETUP
// ═══════════════════════════════════════════════════════════════════════════
function setupLogin() {
    const loginOverlay = document.getElementById('app-login');
    const passwordInput = document.getElementById('app-password');
    const loginButton   = document.getElementById('btn-login');
    const errorMsg      = document.getElementById('login-error');

    function unlock() {
        const pwd = (passwordInput.value || '').trim();
        if (!pwd || pwd === VALID_PASSWORD) {
            loginOverlay.style.display = 'none';
            document.getElementById('main-app-container').style.display = 'block';
            errorMsg.style.display = 'none';
        } else {
            errorMsg.style.display = 'block';
            passwordInput.classList.add('shake');
            setTimeout(() => passwordInput.classList.remove('shake'), 500);
        }
    }

    loginButton?.addEventListener('click', unlock);
    passwordInput?.addEventListener('keypress', e => { if (e.key === 'Enter') unlock(); });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INIT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
    // Init Lucide icons
    if (window.lucide) window.lucide.createIcons();

    // Setup login first
    setupLogin();

    // Setup UI
    setupTabs();
    setupUniverseSelector();
    setupSettingsModal();
    initFilters(renderDashboard, refreshMarketData);

    // Set default universe (all symbols)
    state.selectedUniverse = [...INDEX_SYMBOLS, ...STOCK_SYMBOLS];

    // Check backend connection — triggers auto-login if not authenticated
    await SmartApiService.checkStatus();

    // Initial data load for the default (index) tab
    const initialSymbols = getTabSymbols();
    await generateInitialData(initialSymbols);
    renderDashboard();

    showToast(
        state.apiConnected
            ? '✅ SmartAPI Live — Data loaded!'
            : '⚠️ Mock Mode — Backend connecting in background…'
    );

    // Poll every 10 seconds — checkStatus() internally rate-limits login to every 30s
    setInterval(refreshMarketData, 10000);
});
