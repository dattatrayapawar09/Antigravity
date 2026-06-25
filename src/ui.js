// ui.js
// Dashboard rendering

import { state } from './state.js';
import { calculateMetrics } from './analytics.js';
import { applyFilters } from './filters.js';
import { openInsights } from './insights.js';

window.openInsights = openInsights;

export function initUI() {}

function isMarketLive() {

    const now = new Date();

    const ist = new Date(
        now.toLocaleString(
            "en-US",
            {
                timeZone: "Asia/Kolkata"
            }
        )
    );

    const day = ist.getDay();

    if (day === 0 || day === 6)
        return false;

    const mins =
        ist.getHours() * 60 +
        ist.getMinutes();

    return mins >= 555 && mins <= 930;

}

function updateHeaders(live) {

    document.getElementById('th-cur-vol').textContent =
        live ? 'Current Vol' : 'Last Session Vol';

    document.getElementById('th-avg-vol').textContent =
        live ? 'Avg Vol' : '5 Day Avg';

    document.getElementById('th-ratio').textContent =
        live ? 'Ratio' : 'Session Ratio';

    document.getElementById('th-oi').textContent =
        'OI';

    document.getElementById('th-iv').textContent =
        'IV';

}

export function renderDashboard() {

    const tbody =
        document.getElementById('table-body');

    if (!tbody)
        return;

    const live =
        isMarketLive();

    updateHeaders(live);

    let data =
        state.marketData
            .map(calculateMetrics);

    data =
        applyFilters(data);

    data.sort((a, b) => {

        if (b.volRatio !== a.volRatio)
            return b.volRatio - a.volRatio;

        if (b.strength !== a.strength)
            return b.strength - a.strength;

        return b.volume - a.volume;

    });

    data =
        data.slice(0, 50);

    if (!data.length) {

        tbody.innerHTML =
            `<tr class="loading-row">
                <td colspan="14">
                    No contracts found.
                </td>
            </tr>`;

        return;
    }

    let html = '';

    data.forEach(option => {

        const displayVolume =
            live
                ? option.volume
                : (
                    option.previousSessionVolume ||
                    option.volume
                );

        const displayRatio =
            option.avgVol > 0
                ? displayVolume / option.avgVol
                : 0;

        const spread =
            Number(option.spread || 0);

        const oiClass =
            option.oiChgPct >= 0
                ? 'text-bullish'
                : 'text-bearish';

        const typeClass =
            option.type === 'CE'
                ? 'text-bullish'
                : 'text-bearish';

        let tooltip = '';

        if (
            Array.isArray(option.historicalVolumes) &&
            option.historicalVolumes.length === 5
        ) {

            tooltip = `
                <div class="tooltip-popup glass-panel">

                    <strong>Last 5 Sessions</strong><br>

                    Day 1 :
                    ${(option.historicalVolumes[0] / 1000).toFixed(1)}K<br>

                    Day 2 :
                    ${(option.historicalVolumes[1] / 1000).toFixed(1)}K<br>

                    Day 3 :
                    ${(option.historicalVolumes[2] / 1000).toFixed(1)}K<br>

                    Day 4 :
                    ${(option.historicalVolumes[3] / 1000).toFixed(1)}K<br>

                    Day 5 :
                    ${(option.historicalVolumes[4] / 1000).toFixed(1)}K

                </div>
            `;

        }

        html += `

        <tr onclick="window.openInsights('${option.id}')">

            <td>${option.symbol}</td>

            <td>${option.expiry}</td>

            <td class="${typeClass}">
                ${option.type}
            </td>

            <td>${option.strike}</td>

            <td>
                ${option.spot.toFixed(2)}
            </td>

            <td>
                ₹${option.price.toFixed(2)}
            </td>

            <td>
                ${(displayVolume / 1000).toFixed(1)}K
            </td>

            <td class="tooltip-container">

                ${(option.avgVol / 1000).toFixed(1)}K

                ${tooltip}

            </td>

            <td>

                <strong>

                    ${displayRatio.toFixed(2)}x

                </strong>

            </td>

            <td>

                ${(option.oi / 1000).toFixed(1)}K

            </td>

            <td class="${oiClass}">

                ${option.oiChgPct.toFixed(1)}%

            </td>

            <td>

                ${option.iv.toFixed(2)}%

            </td>

            <td>

                ₹${spread.toFixed(2)}

            </td>

            <td>

                <div class="signal-wrapper">

                    <span class="signal-tag ${option.signalClass}">

                        ${option.signal}

                    </span>

                    <div class="strength-bar">

                        <div
                            class="strength-fill"
                            style="width:${option.strength}%">
                        </div>

                    </div>

                    <small>

                        ${option.strength}%

                    </small>

                </div>

            </td>

        </tr>

        `;

    });

    tbody.innerHTML = html;

    // -------------------------------
    // Highlight strong opportunities
    // -------------------------------

    document
        .querySelectorAll('#table-body tr')
        .forEach(row => {

            const ratioCell = row.children[8];

            if (!ratioCell)
                return;

            const ratio =
                parseFloat(
                    ratioCell.textContent.replace('x', '')
                ) || 0;

            if (ratio >= 5) {

                row.classList.add('extreme-volume');

            }
            else if (ratio >= 3) {

                row.classList.add('high-volume');

            }

        });

    // ------------------------------------
    // Update dashboard statistics
    // ------------------------------------

    const totalContracts =
        document.getElementById('stat-total');

    const bullishSignals =
        document.getElementById('stat-bullish');

    const bearishSignals =
        document.getElementById('stat-bearish');

    const avgRatio =
        document.getElementById('stat-ratio');

    if (totalContracts)
        totalContracts.textContent =
            data.length;

    if (bullishSignals)
        bullishSignals.textContent =
            data.filter(
                x => x.signalClass === 'signal-bull'
            ).length;

    if (bearishSignals)
        bearishSignals.textContent =
            data.filter(
                x => x.signalClass === 'signal-bear'
            ).length;

    if (avgRatio) {

        const ratio =
            data.length
                ? data.reduce(
                    (a, b) => a + b.volRatio,
                    0
                ) / data.length
                : 0;

        avgRatio.textContent =
            ratio.toFixed(2) + "x";

    }

}
