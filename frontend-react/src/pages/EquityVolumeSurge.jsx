import { useEffect, useState, useCallback, useMemo } from "react";
import { FiRefreshCw, FiWifi, FiWifiOff } from "react-icons/fi";
import { useScanner } from "../context/ScannerContext";
import { getEquityVolumeSurge } from "../api/api";
import VolumeCards from "../components/VolumeCards";
import VolumeFilters from "../components/VolumeFilters";
import EquityVolumeTable from "../components/EquityVolumeTable";
import Loading from "../components/Loading";

export default function EquityVolumeSurge() {
  const { backendConnected, refreshInterval } = useScanner();

  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await getEquityVolumeSurge();
      if (response && response.stocks) {
        setStocks(response.stocks);
        setFilteredStocks(response.stocks);
      } else {
        setStocks([]);
        setFilteredStocks([]);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load equity volume surge:", err);
      setError("Failed to fetch volume surge data. Please verify backend is running.");
      setStocks([]);
      setFilteredStocks([]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Auto refresh
  useEffect(() => {
    const timer = setInterval(() => {
      if (backendConnected) {
        fetchData();
      }
    }, refreshInterval * 1000);

    return () => clearInterval(timer);
  }, [fetchData, backendConnected, refreshInterval]);

  const refreshTime = useMemo(() => {
    if (!lastRefresh) return "--:--:--";
    return lastRefresh.toLocaleTimeString();
  }, [lastRefresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">📈 Equity Volume Surge</h1>
          <p className="mt-2 text-slate-400">
            Real-time equity volume surge scanner for all NSE F&O stocks (compared against 5-day average volume)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status */}
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              backendConnected
                ? "border-green-500 bg-green-500/10 text-green-400"
                : "border-red-500 bg-red-500/10 text-red-400"
            }`}
          >
            {backendConnected ? <FiWifi size={18} /> : <FiWifiOff size={18} />}
            <span>{backendConnected ? "Backend Connected" : "Backend Offline"}</span>
          </div>

          {/* Last Refresh */}
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
            Updated: <span className="font-semibold">{refreshTime}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-950 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <VolumeCards stocks={filteredStocks} allStocksCount={stocks.length} />

      {/* Filters */}
      <VolumeFilters stocks={stocks} onFilterChange={setFilteredStocks} />

      {/* Main Table */}
      {loading && !stocks.length ? (
        <Loading />
      ) : (
        <EquityVolumeTable data={filteredStocks} />
      )}

      {/* Footer statistics */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <div>
          Showing <span className="font-semibold text-cyan-400">{filteredStocks.length}</span> of{" "}
          <span className="font-semibold text-white">{stocks.length}</span> F&O stocks
        </div>
        <div>
          Auto-refreshing every <span className="font-semibold text-white">{refreshInterval}s</span>
        </div>
      </div>
    </div>
  );
}
