// ui.js

import { state } from './state.js';
import { calculateMetrics } from './analytics.js';
import { applyFilters } from './filters.js';
import { openInsights } from './insights.js';

window.openInsights = openInsights;

export function renderDashboard() {

    const tableBody =
        document.getElementById('table-body');

    let processed =
        state.marketData.map(calculateMetrics);

    processed =
        applyFilters(processed);

    let html = '';

    processed.forEach(d => {

        html += `
            <tr onclick="openInsights('${d.id}')">

                <td>${d.symbol}</td>

                <td>${d.type}</td>

                <td>${d.strike}</td>

                <td>${d.signal}</td>

                <td>${d.volRatio.toFixed(1)}x</td>

            </tr>
        `;
    });

    tableBody.innerHTML = html;
}
