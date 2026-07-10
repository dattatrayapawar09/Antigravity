import {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

import {
  FiRefreshCw,
  FiWifi,
  FiWifiOff,
  FiActivity,
} from "react-icons/fi";

import { useScanner } from "../context/ScannerContext";

import DashboardSummary from "../components/DashboardSummary";
import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

/* ============================================================
   Dashboard
============================================================ */

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

  /* ============================================================
     Filtered Scanner Data
  ============================================================ */

  const [filteredOptions, setFilteredOptions] =
    useState([]);

  /* ============================================================
     Dashboard always runs ALL Scanner
  ============================================================ */

  useEffect(() => {

    setActiveTab("all");

  }, [setActiveTab]);

  /* ============================================================
     Sync Filtered Data
  ============================================================ */

  useEffect(() => {

    setFilteredOptions(options);

  }, [options]);

  /* ============================================================
     Manual Refresh
  ============================================================ */

  const handleRefresh = useCallback(async () => {

    if (loading) return;

    await refreshAll();

  }, [loading, refreshAll]);

  /* ============================================================
     Last Refresh Time
  ============================================================ */

  const refreshTime = useMemo(() => {

    if (!lastRefresh)
      return "--:--:--";

    return new Date(
      lastRefresh
    ).toLocaleTimeString();

  }, [lastRefresh]);

  /* ============================================================
     Statistics
  ============================================================ */

  const stats = useMemo(() => {

    const total = filteredOptions.length;

    const bullish =
      filteredOptions.filter(

        (x) =>
          x.signal === "Bullish" ||
          x.signal === "Strong Bullish"

      ).length;

    const bearish =
      filteredOptions.filter(

        (x) =>
          x.signal === "Bearish" ||
          x.signal === "Strong Bearish"

      ).length;

    const neutral =
      total - bullish - bearish;

    return {

      total,

      bullish,

      bearish,

      neutral,

    };

  }, [filteredOptions]);

  /* ============================================================
     Render
  ============================================================ */

  return (

    <div className="space-y-6">

      {/* ============================================================
          Dashboard Header
      ============================================================ */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>

          <h1 className="text-3xl font-bold text-white">
            📊 Options Pulse Tracker
          </h1>

          <p className="mt-2 text-slate-400">
            Live Options Analytics Dashboard
          </p>

        </div>

        <div className="flex flex-wrap items-center gap-3">

          {/* Backend Status */}

          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              backendConnected
                ? "border-green-500 bg-green-500/10 text-green-400"
                : "border-red-500 bg-red-500/10 text-red-400"
            }`}
          >
            {backendConnected ? (
              <FiWifi size={18} />
            ) : (
              <FiWifiOff size={18} />
            )}

            <span>
              {backendConnected
                ? "Backend Connected"
                : "Backend Offline"}
            </span>

          </div>

          {/* Last Refresh */}

          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">

            Updated: <span className="font-semibold">{refreshTime}</span>

          </div>

          {/* Refresh Button */}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw
              className={loading ? "animate-spin" : ""}
            />

            {loading
              ? "Refreshing..."
              : "Refresh"}

          </button>

        </div>

      </div>

      {/* ============================================================
          Scanner Statistics
      ============================================================ */}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">

          <div className="flex items-center gap-3">

            <FiActivity
              className="text-cyan-400"
              size={22}
            />

            <div>

              <p className="text-sm text-slate-400">
                Contracts
              </p>

              <h2 className="text-2xl font-bold text-white">
                {stats.total}
              </h2>

            </div>

          </div>

        </div>

        <div className="rounded-xl border border-green-900 bg-green-950/30 p-5">

          <p className="text-sm text-green-300">
            Bullish
          </p>

          <h2 className="mt-2 text-2xl font-bold text-green-400">
            {stats.bullish}
          </h2>

        </div>

        <div className="rounded-xl border border-red-900 bg-red-950/30 p-5">

          <p className="text-sm text-red-300">
            Bearish
          </p>

          <h2 className="mt-2 text-2xl font-bold text-red-400">
            {stats.bearish}
          </h2>

        </div>

        <div className="rounded-xl border border-yellow-900 bg-yellow-950/30 p-5">

          <p className="text-sm text-yellow-300">
            Neutral
          </p>

          <h2 className="mt-2 text-2xl font-bold text-yellow-400">
            {stats.neutral}
          </h2>

        </div>

      </div>

      {/* ============================================================
          Dashboard Summary
      ============================================================ */}

      <DashboardSummary />

      {/* ============================================================
          Market Cards
      ============================================================ */}

      <MarketCards />

      {/* ============================================================
          Filters
      ============================================================ */}

      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFilteredOptions}
        onRefresh={handleRefresh}
      />

      {/* ============================================================
          Scanner Table
      ============================================================ */}

      <ScannerTable
        data={filteredOptions}
      />

      {/* ============================================================
          Footer
      ============================================================ */}

      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">

        <div>
          Showing{" "}
          <span className="font-semibold text-cyan-400">
            {filteredOptions.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-white">
            {options.length}
          </span>{" "}
          option contracts
        </div>

        <div className="flex items-center gap-4">

          <span
            className={`flex items-center gap-2 ${
              backendConnected
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            {backendConnected ? (
              <FiWifi size={16} />
            ) : (
              <FiWifiOff size={16} />
            )}

            {backendConnected
              ? "Live Data"
              : "Backend Offline"}
          </span>

          <span>
            Last Refresh:{" "}
            <span className="font-semibold text-white">
              {refreshTime}
            </span>
          </span>

        </div>

      </div>

    </div>

  );

}