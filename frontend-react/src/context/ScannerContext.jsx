import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getOptions,
  getSpotPrices,
  pingBackend,
} from "../api/api";

/* ============================================================
   Scanner Context
============================================================ */

const ScannerContext = createContext(null);

/* ============================================================
   Provider
============================================================ */

export function ScannerProvider({ children }) {

  /* ============================================================
     Active Scanner Tab
  ============================================================ */

  const [activeTab, setActiveTab] = useState("all");

  /* ============================================================
     Market Data
  ============================================================ */

  const [options, setOptions] = useState([]);
  const [spotPrices, setSpotPrices] = useState({});
  const [expiries, setExpiries] = useState([]);

  /* ============================================================
     Loading / Status
  ============================================================ */

  const [loading, setLoading] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState("");

  const [lastRefresh, setLastRefresh] = useState(() => {
    const value = localStorage.getItem("lastRefresh");
    return value ? new Date(value) : null;
  });

  /* ============================================================
     Settings
  ============================================================ */

  const [refreshInterval, setRefreshInterval] = useState(() =>
    Number(localStorage.getItem("refreshInterval") || 10)
  );

  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );

  /* ============================================================
     Watchlist
  ============================================================ */

  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("watchlist") || "[]");
    } catch {
      return [];
    }
  });

  /* ============================================================
     Prevent Duplicate Refreshes
  ============================================================ */

  const refreshing = useRef(false);

  /* ============================================================
     Backend Health Check
  ============================================================ */

  const checkBackend = useCallback(async () => {
    try {
      const result = await pingBackend();
      const online =
        result?.status === "ok" ||
        result?.status === "healthy" ||
        result?.success === true;
      setBackendConnected(online);
      return online;
    } catch {
      setBackendConnected(false);
      return false;
    }
  }, []);

  /* ============================================================
     Load Spot Prices
  ============================================================ */

  const loadSpotPrices = useCallback(async () => {
    try {
      const response = await getSpotPrices([
        "NIFTY",
        "BANKNIFTY",
        "FINNIFTY",
        "SENSEX",
      ]);
      setSpotPrices(response?.spotPrices ?? {});
    } catch {
      setSpotPrices({});
    }
  }, []);

  /* ============================================================
     Load Scanner Data — accepts tab as argument to avoid stale closure
  ============================================================ */

  const loadScanner = useCallback(async (tab) => {
    const resolvedTab = tab || activeTab;
    try {
      let symbols;
      let mode = resolvedTab;

      if (resolvedTab === "index") {
        symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"];
        mode = "index";
      } else if (resolvedTab === "stocks") {
        symbols = undefined;
        mode = "stocks";
      } else {
        symbols = undefined;
        mode = "all";
      }

      const response = await getOptions({ symbols, mode });

      setOptions(response?.options ?? []);
      setExpiries(response?.expiries ?? []);
    } catch (err) {
      console.error("Scanner loading failed:", err);
      setOptions([]);
      setExpiries([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // intentionally empty — tab is passed as argument

  /* ============================================================
     Refresh All
  ============================================================ */

  const refreshAll = useCallback(async (tab) => {
    if (refreshing.current) return;
    refreshing.current = true;

    setLoading(true);
    setError("");

    try {
      const online = await checkBackend();

      if (!online) {
        setBackendConnected(false);
        setError("Backend Offline");
        return;
      }

      await Promise.all([
        loadSpotPrices(),
        loadScanner(tab),
      ]);

      const now = new Date();
      setLastRefresh(now);
      localStorage.setItem("lastRefresh", now.toISOString());
    } catch (err) {
      console.error(err);
      setError(err.message || "Unknown Error");
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [checkBackend, loadSpotPrices, loadScanner]);

  /* ============================================================
     When activeTab changes — reload data for that tab
  ============================================================ */

  useEffect(() => {
    refreshAll(activeTab);
  // We only want to re-run when the activeTab actually changes.
  // refreshAll is stable (no deps that change), so this is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ============================================================
     Auto Refresh (uses current tab via ref to avoid stale closure)
  ============================================================ */

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (backendConnected && !refreshing.current) {
        refreshAll(activeTabRef.current);
      }
    }, refreshInterval * 1000);

    return () => clearInterval(timer);
  }, [backendConnected, refreshInterval, refreshAll]);

  /* ============================================================
     Watchlist
  ============================================================ */

  const toggleWatchlist = useCallback((contractId) => {
    setWatchlist((prev) => {
      const updated = prev.includes(contractId)
        ? prev.filter((id) => id !== contractId)
        : [...prev, contractId];
      return updated;
    });
  }, []);

  /* ============================================================
     Persist side-effects
  ============================================================ */

  useEffect(() => {
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("refreshInterval", refreshInterval);
  }, [refreshInterval]);

  /* ============================================================
     Context Value
  ============================================================ */

  const value = {
    /* Scanner */
    options,
    expiries,
    activeTab,
    setActiveTab,
    totalContracts: options.length,

    /* Spot Prices */
    spotPrices,

    /* Loading */
    loading,
    error,

    /* Backend */
    backendConnected,
    lastRefresh,

    /* Settings */
    refreshInterval,
    setRefreshInterval,
    theme,
    setTheme,

    /* Watchlist */
    watchlist,
    toggleWatchlist,

    /* Refresh */
    refreshAll: () => refreshAll(activeTabRef.current),
    refreshScanner: () => loadScanner(activeTabRef.current),
    refreshSpotPrices: loadSpotPrices,
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  );
}

/* ============================================================
   useScanner Hook
============================================================ */

export function useScanner() {
  const context = useContext(ScannerContext);

  if (!context) {
    throw new Error("useScanner must be used inside ScannerProvider");
  }

  return context;
}