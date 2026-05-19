/**
 * Indian Options Trading Analytics - PRO Engine
 * Angel One SmartAPI Integration (with mock fallback)
 */

// --- 0. SmartAPI Integration Layer ---
// Backend URL: update PROD_BACKEND_URL after deploying to Render/Railway
const PROD_BACKEND_URL = 'https://antigravity-backend.onrender.com'; // update after deploy
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.protocol === 'file:';
const BACKEND_URL = IS_LOCAL ? 'http://localhost:3001' : PROD_BACKEND_URL;

let apiConnected  = false;   // true = live SmartAPI data
let liveSpotCache = {};      // symbol → live spot price from SmartAPI

const SmartApiService = {
    /** Check backend auth status and update UI badge */
    async checkStatus() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            apiConnected = !!data.connected;
        } catch {
            apiConnected = false;
        }
        this._updateBadge();
        return apiConnected;
    },

    /** Fetch live spot prices for key F&O symbols and cache them */
    async refreshSpotPrices() {
        if (!apiConnected) return;
        try {
            // Get instrument list
            const instrRes = await fetch(`${BACKEND_URL}/api/instruments/fno`);
            const instrData = await instrRes.json();
            if (!instrData.instruments?.length) return;

            // Fetch LTP quotes
            const quoteRes = await fetch(`${BACKEND_URL}/api/market/quote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruments: instrData.instruments, mode: 'LTP' }),
                signal: AbortSignal.timeout(5000),
            });
            const quoteData = await quoteRes.json();

            if (quoteData.connected && quoteData.data) {
                // Parse response — SmartAPI returns { fetched: [...], unfetched: [...] }
                const fetched = quoteData.data.fetched || [];
                fetched.forEach(item => {
                    if (item.tradingSymbol && item.ltp) {
                        liveSpotCache[item.tradingSymbol] = parseFloat(item.ltp);
                    }
                });
                console.log(`[SmartAPI] Updated ${Object.keys(liveSpotCache).length} spot prices`);
            }
        } catch (err) {
            console.warn('[SmartAPI] Failed to refresh spot prices:', err.message);
        }
    },

    /** Get live spot price for a symbol, or null if not available */
    getLiveSpot(symbol) {
        return liveSpotCache[symbol] || null;
    },

    /** Update the Live/Mock status badge in the header */
    _updateBadge() {
        const badge = document.getElementById('api-status-badge');
        if (!badge) return;
        if (apiConnected) {
            badge.className = 'api-badge live';
            badge.innerHTML = '<span class="pulse-indicator"></span> SmartAPI Live';
        } else {
            badge.className = 'api-badge mock';
            badge.innerHTML = '<span></span> Mock Mode';
        }
    },
};

// --- 1. Universe & Mock Data Setup ---
const ALL_FNO_SYMBOLS = [
    'NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY',
    'AARTIIND', 'ABB', 'ABBOTINDIA', 'ABCAPITAL', 'ABFRL', 'ACC', 'ADANIENSOL', 'ADANIENT', 'ADANIPORTS', 'ALKEM', 'AMBUJACEM', 'APOLLOHOSP', 'APOLLOTYRE', 'ASHOKLEY', 'ASIANPAINT', 'ASTRAL', 'ATUL', 'AUBANK', 'AUROPHARMA', 'AXISBANK',
    'BAJAJ-AUTO', 'BAJAJFINSV', 'BAJFINANCE', 'BALKRISIND', 'BALRAMCHIN', 'BANDHANBNK', 'BANKBARODA', 'BATAINDIA', 'BEL', 'BERGEPAINT', 'BHARATFORG', 'BHARTIARTL', 'BHEL', 'BIOCON', 'BOSCHLTD', 'BPCL', 'BRITANNIA', 'BSOFT',
    'CANBK', 'CANFINHOME', 'CHAMBLFERT', 'CHOLAFIN', 'CIPLA', 'COALINDIA', 'COFORGE', 'COLPAL', 'CONCOR', 'COROMANDEL', 'CROMPTON', 'CUB', 'CUMMINSIND',
    'DABUR', 'DALBHARAT', 'DEEPAKNTR', 'DIVISLAB', 'DIXON', 'DLF', 'DRREDDY',
    'EICHERMOT', 'ESCORTS', 'EXIDEIND',
    'FEDERALBNK', 'GAIL', 'GLENMARK', 'GMRINFRA', 'GNFC', 'GODREJCP', 'GODREJPROP', 'GRANULES', 'GRASIM', 'GUJGASLTD',
    'HAL', 'HAVELLS', 'HCLTECH', 'HDFCAMC', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 'HINDCOPPER', 'HINDPETRO', 'HINDUNILVR',
    'ICICIBANK', 'ICICIGI', 'ICICIPRULI', 'IDEA', 'IDFC', 'IDFCFIRSTB', 'IEX', 'IGL', 'INDHOTEL', 'INDIACEM', 'INDIAMART', 'INDIGO', 'INDUSINDBK', 'INDUSTOWER', 'INFY', 'IOC', 'IPCALAB', 'IRCTC', 'ITC',
    'JINDALSTEL', 'JKCEMENT', 'JSWSTEEL', 'JUBLFOOD',
    'KOTAKBANK', 'LALPATHLAB', 'LAURUSLABS', 'LICHSGFIN', 'LT', 'LTIM', 'LTTS', 'LUPIN',
    'M&M', 'M&MFIN', 'MANAPPURAM', 'MARICO', 'MARUTI', 'MCDOWELL-N', 'MCX', 'METROPOLIS', 'MFSL', 'MGL', 'MOTHERSON', 'MPHASIS', 'MRF', 'MUTHOOTFIN',
    'NATIONALUM', 'NAUKRI', 'NAVINFLUOR', 'NESTLEIND', 'NMDC', 'NTPC',
    'OBEROIRLTY', 'OFSS', 'ONGC', 'PAGEIND', 'PEL', 'PERSISTENT', 'PETRONET', 'PFC', 'PIDILITIND', 'PIIND', 'PNB', 'POLYCAB', 'POWERGRID', 'PVRINOX',
    'RAMCOCEM', 'RBLBANK', 'RECLTD', 'RELIANCE',
    'SAIL', 'SBICARD', 'SBILIFE', 'SBIN', 'SHREECEM', 'SHRIRAMFIN', 'SIEMENS', 'SRF', 'SUNTV', 'SUNPHARMA', 'SYNGENE',
    'TATACHEM', 'TATACOMM', 'TATACONSUM', 'TATAMOTORS', 'TATAPOWER', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TORNTPHARM', 'TRENT', 'TVSMOTOR',
    'UBL', 'ULTRACEMCO', 'UPL', 'VEDL', 'VOLTAS', 'WIPRO', 'ZEEL', 'ZYDUSLIFE'
]; // Complete F&O Universe

const STRIKE_GAPS = { NIFTY: 50, BANKNIFTY: 100, SENSEX: 100, FINNIFTY: 50, MIDCPNIFTY: 25 };
const DEFAULT_STRIKE_GAP = 10;

const BASE_PRICES = { 
    NIFTY: 23709, BANKNIFTY: 53710, SENSEX: 75641, 
    RELIANCE: 1335, HDFCBANK: 768, ICICIBANK: 1245, 
    INFY: 1175, TCS: 2300, ITC: 430, SBIN: 945, 
    BHARTIARTL: 1935, KOTAKBANK: 385, LT: 3915, 
    AXISBANK: 1050, HINDUNILVR: 2260, BAJFINANCE: 925, 
    MARUTI: 12500, ASIANPAINT: 2620
};

// Expiries
const EXPIRIES = ['WEEK1', 'WEEK2', 'MONTH1'];

const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];

let selectedUniverse = [...ALL_FNO_SYMBOLS];
let marketData = [];
let updateInterval;
let chartInstance = null;
let currentInsightId = null;

// Filter state
let filters = {
    assetClass: 'INDEX',
    volRatio: 1.0,
    oiChg: 0,
    type: 'ALL',
    expiry: 'ALL'
};

// --- Module-scope dropdown helpers (must be accessible by nav click handlers) ---
function renderUniverseOptions(filterText = '') {
    const optionsContainer = document.getElementById('universe-options');
    if (!optionsContainer) return;
    optionsContainer.innerHTML = '';

    ALL_FNO_SYMBOLS
        .filter(s => s.toLowerCase().includes((filterText || '').toLowerCase()))
        .forEach(sym => {
            const isSelected = selectedUniverse.includes(sym);
            const div = document.createElement('div');
            div.className = 'select-option';
            div.innerHTML = `<label style="display:flex; align-items:center; gap:0.5rem; width:100%; cursor:pointer; margin:0; padding:0;">
                <input type="checkbox" value="${sym}" ${isSelected ? 'checked' : ''}>
                <span>${sym}</span>
            </label>`;

            // Stop propagation so clicks inside the list don't close the dropdown
            div.addEventListener('click', e => e.stopPropagation());

            const cb = div.querySelector('input');
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                if (e.target.checked) {
                    if (!selectedUniverse.includes(sym)) selectedUniverse.push(sym);
                } else {
                    selectedUniverse = selectedUniverse.filter(s => s !== sym);
                }
                updateUniverseTrigger();
                renderDashboard();
            });
            optionsContainer.appendChild(div);
        });
}

function updateUniverseTrigger() {
    const selTrigger = document.querySelector('.select-trigger');
    if (!selTrigger) return;
    if (selectedUniverse.length === 0) {
        selTrigger.textContent = 'Select Symbols...';
    } else if (selectedUniverse.length <= 3) {
        selTrigger.innerHTML = `<div class="selected-tags">${selectedUniverse.map(s => `<span class="sel-tag">${s}</span>`).join('')}</div>`;
    } else {
        selTrigger.innerHTML = `<div class="selected-tags"><span class="sel-tag">${selectedUniverse.length} Selected</span></div>`;
    }
}

// --- 2. Market Data Generation (Mock + Live Hybrid) ---
function generateInitialData() {
    marketData = [];
    
    // Generate for ALL universe to maintain persistent engine state
    ALL_FNO_SYMBOLS.forEach(symbol => {
        // Prefer live spot price from SmartAPI, fall back to BASE_PRICES, then random
        let spotPrice = SmartApiService.getLiveSpot(symbol)
                     || BASE_PRICES[symbol]
                     || (Math.floor(Math.random() * 4000) + 200);

        const strikeGap = STRIKE_GAPS[symbol] || Math.max(5, Math.floor(spotPrice * 0.01));
        
        EXPIRIES.forEach(expiry => {
            // Generate 10 ITM, 10 OTM
            for (let i = -10; i <= 10; i++) {
                const strike = Math.round(spotPrice + (i * strikeGap));
                marketData.push(createOptionObject(symbol, 'CE', strike, spotPrice, expiry));
                marketData.push(createOptionObject(symbol, 'PE', strike, spotPrice, expiry));
            }
        });
    });
}

function createOptionObject(symbol, type, strike, spot, expiry) {
    const distance = Math.abs(strike - spot) / spot;
    
    const baseOI = Math.floor(Math.random() * 100000) * (1 - distance * 5) + 1000;
    const baseVol = Math.floor(Math.random() * 500000) * (1 - distance * 5) + 500;
    
    const willSurge = Math.random() > 0.85; 
    const avgVolTarget = willSurge ? Math.floor(baseVol * (Math.random() * 0.4 + 0.1)) : Math.floor(baseVol * 1.1);
    
    const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    
    // Improved Option Pricing Model (Mock)
    const atmFactor = Math.max(0, 1 - (distance * 20)); // Time value highest at ATM
    const dteDays = expiry === 'WEEK1' ? 3 : expiry === 'WEEK2' ? 10 : 25;
    const timeValue = (spot * 0.05) * atmFactor * Math.sqrt(dteDays / 365);
    const price = intrinsic + timeValue + (Math.random() * 2);
    
    const iv = Math.floor(Math.random() * 30) + 10; // Mock IV 10% - 40%
    const spread = (price * 0.005).toFixed(2); // 0.5% spread
    
    const past5DaysVolume = Array.from({length: 5}, () => Math.max(100, Math.floor(avgVolTarget * (1 + (Math.random() * 0.4 - 0.2)))));
    const avgVol = Math.floor(past5DaysVolume.reduce((sum, val) => sum + val, 0) / 5);

    return {
        id: `${symbol}_${expiry}_${strike}_${type}`,
        symbol, type, strike, spot: spot, expiry,
        price: parseFloat(price.toFixed(2)),
        prevPrice: parseFloat((price * (1 + (Math.random() * 0.04 - 0.02))).toFixed(2)),
        oi: Math.max(100, Math.floor(baseOI)),
        prevOi: Math.max(100, Math.floor(baseOI * (1 + (Math.random() * 0.1 - 0.05)))),
        volume: Math.max(100, Math.floor(baseVol)),
        avgVol: Math.max(100, Math.floor(avgVol)),
        past5DaysVolume,
        iv, spread,
        timestamp: new Date().toLocaleTimeString('en-IN')
    };
}

// --- 3. Analytics & Signal Engine ---
function calculateMetrics(option) {
    const priceChg = option.price - option.prevPrice;
    const oiChg = option.oi - option.prevOi;
    const oiChgPct = (oiChg / option.prevOi) * 100;
    const volRatio = option.volume / option.avgVol;
    
    let signal = 'Neutral', signalClass = '', icon = '';
    
    if (option.type === 'CE') {
        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bullish Buildup'; signalClass = 'signal-bullish-buildup'; icon = 'arrow-up-right';
        } else if (oiChg < 0 && priceChg > 0) {
            signal = 'Short Covering'; signalClass = 'signal-short-covering'; icon = 'shield-alert';
        } else if (oiChg > 0 && priceChg < 0) {
            signal = 'Bearish Buildup'; signalClass = 'signal-bearish-buildup'; icon = 'arrow-down-right';
        } else if (oiChg < 0 && priceChg < 0) {
            signal = 'Long Unwinding'; signalClass = 'signal-long-unwinding'; icon = 'trending-down';
        }
    } else {
        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bearish Buildup'; signalClass = 'signal-bearish-buildup'; icon = 'arrow-down-right';
        } else if (oiChg < 0 && priceChg > 0) {
            signal = 'Short Covering'; signalClass = 'signal-short-covering'; icon = 'shield-alert';
        } else if (oiChg > 0 && priceChg < 0) {
             signal = 'Bullish Buildup'; signalClass = 'signal-bullish-buildup'; icon = 'arrow-up-right';
        } else if (oiChg < 0 && priceChg < 0) {
            signal = 'Long Unwinding'; signalClass = 'signal-long-unwinding'; icon = 'trending-down';
        }
    }

    // Signal Strength Score (0 - 100)
    let strength = Math.min(100, (volRatio * 10) + (Math.abs(oiChgPct) * 2) + (Math.abs(priceChg/option.prevPrice) * 100));
    
    return { ...option, priceChg, oiChgPct, volRatio, signal, signalClass, icon, strength };
}

// --- 4. Live Updates & Alerts ---
function simulateMarketTick() {
    marketData = marketData.map(opt => {
        if (Math.random() > 0.8) {
            const priceVol = opt.price * 0.01;
            const newPrice = Math.max(0.05, opt.price + (Math.random() * priceVol * 2 - priceVol));
            const newOi = Math.max(100, opt.oi + (Math.random() * opt.oi * 0.05 * 2 - opt.oi * 0.05));
            const newVol = opt.volume + Math.floor(Math.random() * 1000);
            const newIv = opt.iv + (Math.random() * 2 - 1); // Fluctuating IV

            const updatedOpt = {
                ...opt, prevPrice: opt.price, price: parseFloat(newPrice.toFixed(2)),
                prevOi: opt.oi, oi: Math.floor(newOi), volume: newVol, iv: parseFloat(newIv.toFixed(1)),
                timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false })
            };
            
            checkAndFireAlerts(updatedOpt);
            
            if(currentInsightId === updatedOpt.id) updateInsightsView(updatedOpt);

            return updatedOpt;
        }
        return opt;
    });
    
    if(document.getElementById('view-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

function checkAndFireAlerts(opt) {
    // All popups disabled as per user request
}

function createToast(title, message, typeClass, iconName) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${typeClass}`;
    toast.innerHTML = `
        <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    container.appendChild(toast);
    if(window.lucide) lucide.createIcons({root: toast});
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- 5. UI Rendering & Dashboard ---
function formatNumber(num) {
    if (num >= 10000000) return (num / 10000000).toFixed(2) + 'Cr';
    if (num >= 100000) return (num / 100000).toFixed(2) + 'L';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function renderDashboard() {
    const tableBody = document.getElementById('table-body');
    let processedData = marketData.map(calculateMetrics);
    
    // Apply Filters
    processedData = processedData.filter(d => {
        if (!selectedUniverse.includes(d.symbol)) return false;
        if (filters.assetClass === 'INDEX' && !INDEX_SYMBOLS.includes(d.symbol)) return false;
        if (filters.assetClass === 'STOCKS' && INDEX_SYMBOLS.includes(d.symbol)) return false;
        if (d.volRatio < filters.volRatio) return false;
        if (filters.type !== 'ALL' && d.type !== filters.type) return false;
        if (filters.expiry !== 'ALL' && d.expiry !== filters.expiry) return false;
        if (Math.abs(d.oiChgPct) < filters.oiChg) return false;
        return true;
    });

    // Top 50 by Signal Strength
    processedData = processedData.sort((a, b) => b.strength - a.strength).slice(0, 50);

    if (processedData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-muted); padding: 3rem;">No contracts match the current filters.</td></tr>`;
        return;
    }

    let html = '';
    processedData.forEach(d => {
        const oiChgColor = d.oiChgPct > 0 ? 'bullish' : 'bearish';
        const strColor = d.strength > 80 ? 'warning' : (d.strength > 50 ? 'info' : 'text-muted');
        
        html += `
            <tr onclick="openInsights('${d.id}')">
                <td class="font-bold">${d.symbol}</td>
                <td class="text-muted" style="font-size:0.7rem;">${d.expiry}</td>
                <td><span class="type-badge type-${d.type.toLowerCase()}">${d.type}</span></td>
                <td class="font-mono font-bold">${d.strike}</td>
                <td class="font-mono text-muted">₹${d.spot.toFixed(2)}</td>
                <td class="font-mono">₹${d.price.toFixed(2)}</td>
                <td class="font-mono">${formatNumber(d.volume)}</td>
                <td class="font-mono text-muted tooltip-container">
                    ${formatNumber(d.avgVol)}
                    <div class="tooltip-text">
                        <strong>Last 5 Days Vol</strong><br>
                        D-1: ${formatNumber(d.past5DaysVolume[4])}<br>
                        D-2: ${formatNumber(d.past5DaysVolume[3])}<br>
                        D-3: ${formatNumber(d.past5DaysVolume[2])}<br>
                        D-4: ${formatNumber(d.past5DaysVolume[1])}<br>
                        D-5: ${formatNumber(d.past5DaysVolume[0])}
                    </div>
                </td>
                <td class="font-mono font-bold warning">${d.volRatio.toFixed(1)}x</td>
                <td class="font-mono">${formatNumber(d.oi)}</td>
                <td class="font-mono ${oiChgColor}">${d.oiChgPct > 0 ? '+' : ''}${d.oiChgPct.toFixed(1)}%</td>
                <td class="font-mono">${d.iv.toFixed(1)}</td>
                <td class="font-mono text-muted">${d.spread}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <div style="width:50px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                            <div class="${strColor === 'warning' ? 'bg-warning' : 'bg-info'}" style="width:${d.strength}%; height:100%; background:var(--${strColor});"></div>
                        </div>
                        <span class="font-mono ${strColor}">${d.strength.toFixed(0)}</span>
                    </div>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

// --- 6. Insights View ---
function openInsights(id) {
    currentInsightId = id;
    document.getElementById('view-dashboard').classList.remove('active');
    document.getElementById('nav-index').classList.remove('active');
    document.getElementById('nav-stocks').classList.remove('active');
    
    document.getElementById('view-insights').classList.add('active');
    document.getElementById('nav-insights').classList.add('active');
    
    document.getElementById('insights-content').style.display = 'grid';
    
    const opt = calculateMetrics(marketData.find(m => m.id === id));
    updateInsightsView(opt);
    initChart(opt);
}

function updateInsightsView(opt) {
    if(!opt) return;
    
    document.getElementById('insight-title').textContent = `${opt.symbol} - ${opt.strike} ${opt.type} (${opt.expiry})`;
    
    document.getElementById('insight-badges').innerHTML = `
        <span class="signal-badge ${opt.signalClass}"><i data-lucide="${opt.icon}" style="width:14px;"></i> ${opt.signal}</span>
        <span class="signal-badge" style="border:1px solid var(--border-color);">Vol: ${opt.volRatio.toFixed(1)}x</span>
    `;
    
    document.getElementById('ins-iv').textContent = `${opt.iv.toFixed(1)}%`;
    document.getElementById('ins-iv-trend').textContent = opt.iv > 20 ? 'Elevated' : 'Normal';
    document.getElementById('ins-delta').textContent = opt.type==='CE' ? '0.45' : '-0.45'; // Mock
    document.getElementById('ins-spread').textContent = opt.spread;
    
    // Aggregated mock stats
    document.getElementById('ins-pcr').textContent = (Math.random() * 0.8 + 0.6).toFixed(2);
    document.getElementById('ins-maxpain').textContent = (Math.round(opt.spot / 100) * 100).toString();
    document.getElementById('ins-support').textContent = (Math.round(opt.spot*0.98 / 50)*50).toString();
    document.getElementById('ins-resistance').textContent = (Math.round(opt.spot*1.02 / 50)*50).toString();

    // AI Insight
    let aiText = `The ${opt.symbol} ${opt.strike} ${opt.type} contract is showing highly unusual activity. `;
    if(opt.signal.includes('Buildup')) aiText += `Fresh positions are being aggressively created, indicated by a ${opt.oiChgPct.toFixed(1)}% jump in Open Interest. `;
    else aiText += `Positions are being closed out, indicated by dropping Open Interest. `;
    aiText += `The volume is ${opt.volRatio.toFixed(1)} times its 5-day average, suggesting Smart Money involvement. Watch for a potential breakout if spot sustains above ${opt.spot}.`;
    document.getElementById('ai-insight-text').textContent = aiText;

    // Smart Money Bar
    const smartBar = document.getElementById('smart-money-bar');
    const smartText = document.getElementById('smart-money-text');
    if(opt.signal === 'Bullish Buildup') {
        smartBar.style.width = '80%'; smartBar.style.background = 'var(--bullish)';
        smartText.textContent = 'Institutional Buying'; smartText.className = 'font-bold bullish';
    } else if (opt.signal === 'Bearish Buildup') {
        smartBar.style.width = '20%'; smartBar.style.background = 'var(--bearish)';
        smartText.textContent = 'Institutional Selling'; smartText.className = 'font-bold bearish';
    } else {
        smartBar.style.width = '50%'; smartBar.style.background = 'var(--info)';
        smartText.textContent = 'Accumulation/Distribution'; smartText.className = 'font-bold info';
    }

    if(window.lucide) lucide.createIcons();
}

function initChart(opt) {
    const ctx = document.getElementById('historicalChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    
    // Generate mock historical intraday data (last 30 ticks)
    let prices = []; let volumes = []; let labels = [];
    let curPrice = opt.price;
    for(let i=30; i>=0; i--) {
        labels.push(`-${i}m`);
        prices.push(curPrice);
        volumes.push(Math.floor(Math.random() * 5000));
        curPrice = curPrice * (1 + (Math.random() * 0.02 - 0.01)); // walk backwards
    }
    prices.reverse();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'LTP',
                data: prices,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'Volume',
                type: 'bar',
                data: volumes,
                backgroundColor: 'rgba(148, 163, 184, 0.2)',
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } },
                x: { grid: { display: false } }
            }
        }
    });
}

// --- 7. Event Listeners & UI Init ---
function initUI() {
    // Nav Tabs
    document.getElementById('nav-index').addEventListener('click', () => {
        document.getElementById('view-insights').classList.remove('active');
        document.getElementById('nav-insights').classList.remove('active');
        document.getElementById('nav-stocks').classList.remove('active');
        
        document.getElementById('nav-index').classList.add('active');
        document.getElementById('view-dashboard').classList.add('active');
        document.getElementById('universe-select-group').style.display = 'none';
        
        filters.assetClass = 'INDEX';
        currentInsightId = null;
        renderDashboard();
    });

    document.getElementById('nav-stocks').addEventListener('click', () => {
        document.getElementById('view-insights').classList.remove('active');
        document.getElementById('nav-insights').classList.remove('active');
        document.getElementById('nav-index').classList.remove('active');
        
        document.getElementById('nav-stocks').classList.add('active');
        document.getElementById('view-dashboard').classList.add('active');
        document.getElementById('universe-select-group').style.display = 'flex';
        
        filters.assetClass = 'STOCKS';
        currentInsightId = null;
        renderUniverseOptions(document.getElementById('universe-search').value);
        renderDashboard();
    });

    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
        if (filters.assetClass === 'STOCKS') {
            document.getElementById('nav-stocks').click();
        } else {
            document.getElementById('nav-index').click();
        }
    });

    // Universe Dropdown — Portal Pattern
    // Move the dropdown to document.body so it escapes ALL stacking contexts
    // (backdrop-filter, overflow, transform on ancestors all create stacking contexts)
    const selWrapper = document.getElementById('universe-select-wrapper');
    const selTrigger = document.querySelector('.select-trigger');
    const searchInput = document.getElementById('universe-search');
    const selDropdown = selWrapper.querySelector('.select-dropdown');

    // Detach from filter-bar and re-attach directly to body
    document.body.appendChild(selDropdown);
    let dropdownOpen = false;

    function positionDropdown() {
        const rect = selTrigger.getBoundingClientRect();
        selDropdown.style.top   = (rect.bottom + 6) + 'px';
        selDropdown.style.left  = rect.left + 'px';
        selDropdown.style.width = rect.width + 'px';
    }

    function openDropdown() {
        dropdownOpen = true;
        positionDropdown();
        selDropdown.style.display = 'flex';
    }

    function closeDropdown() {
        dropdownOpen = false;
        selDropdown.style.display = 'none';
    }

    selTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownOpen ? closeDropdown() : openDropdown();
    });

    // Prevent clicks inside dropdown from closing it
    selDropdown.addEventListener('click', (e) => e.stopPropagation());

    // Reposition on scroll / resize
    window.addEventListener('scroll', () => { if (dropdownOpen) positionDropdown(); }, true);
    window.addEventListener('resize', () => { if (dropdownOpen) positionDropdown(); });

    searchInput.addEventListener('input', (e) => renderUniverseOptions(e.target.value));

    document.getElementById('btn-select-all').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedUniverse = [...ALL_FNO_SYMBOLS];
        renderUniverseOptions(document.getElementById('universe-search').value);
        updateUniverseTrigger();
        renderDashboard();
    });

    document.getElementById('btn-clear-all').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedUniverse = [];
        renderUniverseOptions(document.getElementById('universe-search').value);
        updateUniverseTrigger();
        renderDashboard();
    });

    // Close dropdown when clicking anywhere outside
    document.addEventListener('click', (e) => {
        if (dropdownOpen && !selTrigger.contains(e.target) && !selDropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    renderUniverseOptions();
    updateUniverseTrigger();

    // Filters
    document.getElementById('filter-vol-ratio').addEventListener('input', (e) => { filters.volRatio = parseFloat(e.target.value) || 0; renderDashboard(); });
    document.getElementById('filter-oi-chg').addEventListener('input', (e) => { filters.oiChg = parseFloat(e.target.value) || 0; renderDashboard(); });
    document.getElementById('filter-expiry').addEventListener('change', (e) => { filters.expiry = e.target.value; renderDashboard(); });
    
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filters.type = e.target.dataset.val;
            renderDashboard();
        });
    });

    // --- Settings Modal ---
    const settingsModal = document.getElementById('settings-modal');

    document.getElementById('btn-settings').addEventListener('click', () => {
        // Populate fields from localStorage if previously saved
        document.getElementById('s-api-key').value   = localStorage.getItem('sa_api_key')   || '';
        document.getElementById('s-client-id').value = localStorage.getItem('sa_client_id') || '';
        document.getElementById('s-password').value  = '';
        document.getElementById('s-totp').value       = localStorage.getItem('sa_totp')      || '';

        // Update modal status badge
        const statusEl  = document.getElementById('api-connection-status');
        const statusTxt = document.getElementById('modal-status-text');
        if (apiConnected) {
            statusEl.className = 'modal-status live';
            statusTxt.textContent = `Connected — SmartAPI Live Mode (${localStorage.getItem('sa_client_id') || ''})`;
        } else {
            statusEl.className = 'modal-status mock';
            statusTxt.textContent = 'Not connected — running in Mock Mode';
        }

        settingsModal.style.display = 'flex';
        if (window.lucide) lucide.createIcons({ root: settingsModal });
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    // Test Connection — triggers a login attempt via the backend
    document.getElementById('btn-test-connection').addEventListener('click', async () => {
        const btn = document.getElementById('btn-test-connection');
        btn.textContent = 'Testing...';
        btn.disabled = true;
        try {
            const res  = await fetch(`${BACKEND_URL}/api/auth/login`, { method: 'POST', signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            const statusEl  = document.getElementById('api-connection-status');
            const statusTxt = document.getElementById('modal-status-text');
            if (data.connected) {
                statusEl.className = 'modal-status live';
                statusTxt.textContent = 'Connected! SmartAPI Live Mode active ✓';
                apiConnected = true;
                SmartApiService._updateBadge();
            } else {
                statusEl.className = 'modal-status mock';
                statusTxt.textContent = `Login failed: ${data.reason || 'Check credentials'}`;
            }
        } catch {
            document.getElementById('modal-status-text').textContent = 'Backend not reachable. Start: node backend/server.js';
        }
        btn.innerHTML = '<i data-lucide="zap" style="width:16px;"></i> Test Connection';
        btn.disabled = false;
        if (window.lucide) lucide.createIcons({ root: settingsModal });
    });

    // Save — stores keys to localStorage (backend still needs .env restart for real use)
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const apiKey   = document.getElementById('s-api-key').value.trim();
        const clientId = document.getElementById('s-client-id').value.trim();
        const totp     = document.getElementById('s-totp').value.trim();
        if (apiKey)   localStorage.setItem('sa_api_key',   apiKey);
        if (clientId) localStorage.setItem('sa_client_id', clientId);
        if (totp)     localStorage.setItem('sa_totp',      totp);
        createToast('Settings Saved', 'Update backend/.env with these values, then restart the server.', 'alert-warning', 'info');
        settingsModal.style.display = 'none';
    });

    // Start Engine
    document.getElementById('universe-select-group').style.display = 'none'; // Default to index tab view
    generateInitialData();
    renderDashboard();
    updateInterval = setInterval(simulateMarketTick, 2000);

    // --- SmartAPI Live Integration ---
    // Check API status on startup and every 30 seconds
    SmartApiService.checkStatus().then(connected => {
        if (connected) {
            SmartApiService.refreshSpotPrices().then(() => {
                // Re-generate data with live spots if available
                generateInitialData();
                renderDashboard();
            });
        }
    });
    setInterval(() => SmartApiService.checkStatus(), 30000);
    // Refresh live spot prices every 5 seconds when connected
    setInterval(() => {
        if (apiConnected) SmartApiService.refreshSpotPrices();
    }, 5000);
}

document.addEventListener('DOMContentLoaded', initUI);
