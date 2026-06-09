import { initUI } from "./ui.js";
import { initMarket } from "./market.js";
import { initFilters } from "./filters.js";
import { initAnalytics } from "./analytics.js";
import { initSmartAPI } from "./smartapi.js";
import { initInsights } from "./insights.js";

window.addEventListener("DOMContentLoaded", async () => {
    initUI();
    initFilters();
    initSmartAPI();
    initAnalytics();
    initInsights();

    await initMarket(); // usually async (data fetch / websocket)
});
