// ui.js

import { state } from './state.js';
import { calculateMetrics } from './analytics.js';
import { applyFilters } from './filters.js';
import { openInsights } from './insights.js';

// Expose insights globally
window.openInsights = openInsights;

/**
 * Initialize UI components and handle login unlocking.
 */
export function initUI() {
  const loginOverlay = document.getElementById('app-login');
  const passwordInput = document.getElementById('app-password');
  const loginButton = document.getElementById('btn-login');
  const errorMsg = document.getElementById('login-error');

  const VALID_PASSWORD = 'datta@7020083825'; // user‑specified password

  // Allow empty password for demo/testing; otherwise check against VALID_PASSWORD
  if (!passwordInput.value.trim() || passwordInput.value.trim() === VALID_PASSWORD) {
    // Hide login overlay and show main app
    loginOverlay.style.display = 'none';
    document.getElementById('main-app-container').style.display = 'block';
    errorMsg.style.display = 'none';
  } else {
    errorMsg.style.display = 'block';
  }

  loginButton?.addEventListener('click', unlock);
  passwordInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') unlock();
  });
}

export function renderDashboard() {
  const tableBody = document.getElementById('table-body');
  let processed = state.marketData.map(calculateMetrics);
  processed = applyFilters(processed);
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
