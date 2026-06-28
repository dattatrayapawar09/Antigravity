import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiWifi, FiWifiOff } from "react-icons/fi";

import { useScanner } from "../context/ScannerContext";

import DashboardSummary from "../components/DashboardSummary";
import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function Dashboard() {
  const {
    options,
    expiries,
    refreshAll,
    setActiveTab,
    backendConnected,
    lastRefresh,
    loading,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  /*
  ------------------------------------------
  Dashboard always uses ALL scanner mode
  ------------------------------------------
  */

  useEffect(() => {
    setActiveTab("all");
  }, [setActiveTab]);

  /*
  ------------------------------------------
  Keep filtered data synchronized
  ------------------------------------------
  */

  useEffect(() => {
    setFilteredOptions(options);
  }, [options]);

  /*
  ------------------------------------------
  Last Refresh
  ------------------------------------------
  */

  const refreshTime = useMemo(() => {
    if (!lastRefresh) return "--:--:--";

    return new Date(lastRefresh).toLocaleTimeString();
  }, [lastRefresh]);

  return (
    <div className="space-y-6">

      {/* =====================================================
          Header
      ===================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>

          <h1 className="text-3xl font-bold text-white">
            📊 Options Pulse Tracker
          </h1>

          <p className="mt-2 text-slate-400">
            Live Options Analytics Dashboard
          </p>

        </div>

        <div className="flex flex-wrap items-center gap-4">

          {/* Backend Status */}

          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
              backendConnected
                ? "border-green-500 bg-green-500/10 text-green-400"
                : "border-red-500 bg-red-500/10 text-red-400"
            }`}
          >
            {backendConnected ? (
              <FiWifi />
            ) : (
              <FiWifiOff />
            )}

            <span>
              {backendConnected
                ? "Backend Connected"
                : "Backend Offline"}
            </span>

          </div>

          {/* Last Refresh */}

          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">

            Updated: {refreshTime}

          </div>

          {/* Refresh */}

          <button
            onClick={refreshAll}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw
              className={loading ? "animate-spin" : ""}
            />

            {loading ? "Refreshing..." : "Refresh"}

          </button>

        </div>

      </div>

      {/* =====================================================
          Dashboard Summary
      ===================================================== */}

      <DashboardSummary />

      {/* =====================================================
          Market Cards
      ===================================================== */}

      <MarketCards />

      {/* =====================================================
          Filters
      ===================================================== */}

      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFilteredOptions}
        onRefresh={refreshAll}
      />

      {/* =====================================================
          Scanner Table
      ===================================================== */}

      <ScannerTable
        data={filteredOptions}
      />

    </div>
  );
}