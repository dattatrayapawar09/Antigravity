import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FiRefreshCw, FiWifi, FiWifiOff, FiTarget } from "react-icons/fi";
import { useScanner } from "../context/ScannerContext";
import { getSmartReversalOptions } from "../api/api";
import SmartReversalOptionCards   from "../components/SmartReversalOptionCards";
import SmartReversalOptionFilters from "../components/SmartReversalOptionFilters";
import SmartReversalOptionTable   from "../components/SmartReversalOptionTable";
import Loading from "../components/Loading";

const DEFAULT_PARAMS = {
  lookbackDays:       20,
  minPriceDrop:       10,
  minVolumeRatio:     2,
  optionVolumeRatio:  2,
  strikeRange:        2,
  expiry:             "both",
  optionType:         "both",
  maxSpreadPct:       2.0,
};

export default function SmartReversalOptions() {
  const { backendConnected, refreshInterval } = useScanner();

  const [contracts,         setContracts        ] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [loading,           setLoading          ] = useState(false);
  const [error,             setError            ] = useState("");
  const [lastRefresh,       setLastRefresh      ] = useState(null);
  const [scanMeta,          setScanMeta         ] = useState({
    stocksQualified: 0,
    optionsScanned:  0,
    elapsedMs:       0,
  });

  const params = useRef(DEFAULT_PARAMS);

  /* ── Fetch ───────────────────────────────────────────────────────────────── */
  const fetchData = useCallback(async (overrideParams) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const p        = overrideParams ?? params.current;
      const response = await getSmartReversalOptions(p);
      if (response?.contracts) {
        setContracts(response.contracts);
        setFilteredContracts(response.contracts);
        setScanMeta({
          stocksQualified: response.stocksQualified ?? 0,
          optionsScanned:  response.optionsScanned  ?? 0,
          elapsedMs:       response.elapsedMs       ?? 0,
        });
      } else {
        setContracts([]);
        setFilteredContracts([]);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("SmartReversalOptions fetch error:", err);
      setError("Failed to fetch Smart Reversal Options data. Check backend connection.");
      setContracts([]);
      setFilteredContracts([]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  /* ── Initial load ────────────────────────────────────────────────────────── */
  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  /* ── Auto refresh ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const timer = setInterval(() => {
      if (backendConnected) fetchData();
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [backendConnected, refreshInterval, fetchData]);

  /* ── Server param change handler ─────────────────────────────────────────── */
  const handleParamChange = useCallback((newParams) => {
    const prev = params.current;
    const changed = Object.keys(newParams).some((k) => prev[k] !== newParams[k]);
    if (changed) {
      params.current = { ...params.current, ...newParams };
      fetchData(params.current);
    }
  }, [fetchData]);

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  const refreshTime = useMemo(() => {
    if (!lastRefresh) return "--:--:--";
    return lastRefresh.toLocaleTimeString();
  }, [lastRefresh]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/30">
              <FiTarget className="text-violet-400" size={20} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Smart Reversal Options
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                Options scanner combining underlying reversal + option activity
              </p>
            </div>
          </div>

          {/* Scan meta pills */}
          {(scanMeta.stocksQualified > 0 || scanMeta.optionsScanned > 0) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                <span className="font-bold text-emerald-400">{scanMeta.stocksQualified}</span> stocks qualified
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                <span className="font-bold text-sky-400">{scanMeta.optionsScanned}</span> options scanned
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                <span className="font-bold text-violet-400">{contracts.length}</span> matched
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-slate-400">
                {scanMeta.elapsedMs}ms
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            Updated: <span className="font-semibold">{refreshTime}</span>
          </div>

          <button
            id="sro-refresh"
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <SmartReversalOptionCards
        contracts={filteredContracts}
        stocksQualified={scanMeta.stocksQualified}
        optionsScanned={scanMeta.optionsScanned}
      />

      {/* Filters */}
      <SmartReversalOptionFilters
        contracts={contracts}
        onFilterChange={setFilteredContracts}
        onParamChange={handleParamChange}
      />

      {/* Table */}
      {loading && !contracts.length ? (
        <Loading />
      ) : (
        <SmartReversalOptionTable data={filteredContracts} />
      )}

      {/* Footer */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <div>
          Showing{" "}
          <span className="font-semibold text-violet-400">{filteredContracts.length}</span>
          {" "}of{" "}
          <span className="font-semibold text-white">{contracts.length}</span>{" "}
          option setups
        </div>
        <div>
          Auto-refresh every{" "}
          <span className="font-semibold text-white">{refreshInterval}s</span>
        </div>
      </div>

    </div>
  );
}
