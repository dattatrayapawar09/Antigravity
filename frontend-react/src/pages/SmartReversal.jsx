import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FiRefreshCw, FiWifi, FiWifiOff, FiZap } from "react-icons/fi";
import { useScanner } from "../context/ScannerContext";
import { getSmartReversal } from "../api/api";
import SmartReversalCards from "../components/SmartReversalCards";
import SmartReversalFilters from "../components/SmartReversalFilters";
import SmartReversalTable from "../components/SmartReversalTable";
import Loading from "../components/Loading";

const DEFAULT_PARAMS = {
  lookbackDays:   20,
  minPriceDrop:   10,
  minVolumeRatio: 2,
  closePosition:  70,
};

export default function SmartReversal() {
  const { backendConnected, refreshInterval } = useScanner();

  const [stocks,         setStocks        ] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [loading,        setLoading       ] = useState(false);
  const [error,          setError         ] = useState("");
  const [lastRefresh,    setLastRefresh   ] = useState(null);
  const [scanMeta,       setScanMeta      ] = useState({ scanned: 0, elapsedMs: 0 });

  // Server-side params (lookback, minDrop, VRatio, closePos)
  const params = useRef(DEFAULT_PARAMS);

  const fetchData = useCallback(async (overrideParams) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const p = overrideParams ?? params.current;
      const response = await getSmartReversal(p);
      if (response && response.stocks) {
        setStocks(response.stocks);
        setFilteredStocks(response.stocks);
        setScanMeta({
          scanned:   response.scanned   ?? 0,
          elapsedMs: response.elapsedMs ?? 0,
        });
      } else {
        setStocks([]);
        setFilteredStocks([]);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Smart Reversal fetch failed:", err);
      setError("Failed to fetch Smart Reversal data. Check backend connection.");
      setStocks([]);
      setFilteredStocks([]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Initial fetch
  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // Auto refresh
  useEffect(() => {
    const timer = setInterval(() => {
      if (backendConnected) fetchData();
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [backendConnected, refreshInterval, fetchData]);

  // Called when server-side params change (trigger re-fetch)
  const handleParamChange = useCallback((newParams) => {
    const prev = params.current;
    const changed =
      prev.lookbackDays   !== newParams.lookbackDays   ||
      prev.minPriceDrop   !== newParams.minPriceDrop   ||
      prev.minVolumeRatio !== newParams.minVolumeRatio ||
      prev.closePosition  !== newParams.closePosition;
    if (changed) {
      params.current = newParams;
      fetchData(newParams);
    }
  }, [fetchData]);

  const refreshTime = useMemo(() => {
    if (!lastRefresh) return "--:--:--";
    return lastRefresh.toLocaleTimeString();
  }, [lastRefresh]);

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <FiZap className="text-emerald-400" size={20} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Smart Reversal Scanner
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                Identify NSE F&O stocks showing potential swing reversal setups
              </p>
            </div>
          </div>

          {/* Scan meta pills */}
          {scanMeta.scanned > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                Scanned <span className="font-bold text-white">{scanMeta.scanned}</span> stocks
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                Matched <span className="font-bold text-emerald-400">{stocks.length}</span>
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                {scanMeta.elapsedMs}ms
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connection status */}
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              backendConnected
                ? "border-green-800/60 bg-green-950/30 text-green-400"
                : "border-red-800/60 bg-red-950/30 text-red-400"
            }`}
          >
            {backendConnected ? <FiWifi size={16} /> : <FiWifiOff size={16} />}
            <span>{backendConnected ? "Connected" : "Offline"}</span>
          </div>

          {/* Last update */}
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            Updated: <span className="font-semibold">{refreshTime}</span>
          </div>

          {/* Refresh button */}
          <button
            id="sr-refresh"
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <SmartReversalCards stocks={filteredStocks} allScanned={scanMeta.scanned} />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <SmartReversalFilters
        stocks={stocks}
        onFilterChange={setFilteredStocks}
        onParamChange={handleParamChange}
      />

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading && !stocks.length ? (
        <Loading />
      ) : (
        <SmartReversalTable data={filteredStocks} />
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <div>
          Showing{" "}
          <span className="font-semibold text-emerald-400">{filteredStocks.length}</span>
          {" "}of{" "}
          <span className="font-semibold text-white">{stocks.length}</span>{" "}
          reversal candidates
        </div>
        <div>
          Auto-refresh every{" "}
          <span className="font-semibold text-white">{refreshInterval}s</span>
        </div>
      </div>

    </div>
  );
}
