import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const [activeTab, setActiveTab] =
    useState("all");

  /* ============================================================
     Market Data
  ============================================================ */

  const [options, setOptions] =
    useState([]);

  const [spotPrices, setSpotPrices] =
    useState({});

  const [expiries, setExpiries] =
    useState([]);

  /* ============================================================
     Filters
  ============================================================ */

  const [filters, setFilters] =
    useState({

      expiry: "",

      type: "ALL",

      signal: "ALL",

      search: "",

      minRatio: 1,

    });

  /* ============================================================
     Loading
  ============================================================ */

  const [loading, setLoading] =
    useState(false);

  const [backendConnected, setBackendConnected] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastRefresh, setLastRefresh] =
    useState(() => {

      const value =
        localStorage.getItem("lastRefresh");

      return value
        ? new Date(value)
        : null;

    });

  /* ============================================================
     Settings
  ============================================================ */

  const [refreshInterval, setRefreshInterval] =
    useState(() =>

      Number(
        localStorage.getItem(
          "refreshInterval"
        ) || 10
      )

    );

  const [theme, setTheme] =
    useState(() =>

      localStorage.getItem("theme") ||
      "dark"

    );

  /* ============================================================
     Watchlist
  ============================================================ */

  const [watchlist, setWatchlist] =
    useState(() => {

      try {

        return JSON.parse(

          localStorage.getItem(
            "watchlist"
          ) || "[]"

        );

      } catch {

        return [];

      }

    });

  /* ============================================================
     Prevent Duplicate Refreshes
  ============================================================ */

  const refreshing =
    useRef(false);

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

    } catch (err) {

      console.error(
        "Backend health check failed:",
        err
      );

      setBackendConnected(false);

      return false;

    }

  }, []);

  /* ============================================================
     Load Spot Prices
  ============================================================ */

  const loadSpotPrices = useCallback(async () => {

    try {

      const response =
        await getSpotPrices([
          "NIFTY",
          "BANKNIFTY",
          "FINNIFTY",
          "SENSEX",
        ]);

      if (response?.spotPrices) {

        setSpotPrices(
          response.spotPrices
        );

      } else {

        setSpotPrices({});

      }

    } catch (err) {

      console.error(
        "Spot price loading failed:",
        err
      );

      setSpotPrices({});

    }

  }, []);

  /* ============================================================
     Load Scanner Data
  ============================================================ */

  const loadScanner = useCallback(async () => {

    try {

      let symbols;

      switch (activeTab) {

        case "index":

          symbols = [
            "NIFTY",
            "BANKNIFTY",
            "FINNIFTY",
            "SENSEX",
          ];

          break;

        case "stock":

          symbols = undefined;

          break;

        case "all":

        default:

          symbols = undefined;

          break;

      }

      const response =
        await getOptions({

          symbols,

          expiry:
            filters.expiry || null,

          mode: activeTab,

        });

      if (response?.options) {

        setOptions(
          response.options
        );

      } else {

        setOptions([]);

      }

      if (response?.expiries) {

        setExpiries(
          response.expiries
        );

      } else {

        setExpiries([]);

      }

    } catch (err) {

      console.error(
        "Scanner loading failed:",
        err
      );

      setOptions([]);

      setExpiries([]);

    }

  }, [

    activeTab,

    filters.expiry,

  ]);
  /* ============================================================
     Refresh Everything
  ============================================================ */

  const refreshAll = useCallback(async () => {

    if (refreshing.current) return;

    refreshing.current = true;

    if (!options.length) {
      setLoading(true);
    }

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

        loadScanner(),

      ]);

      const now = new Date();

      setLastRefresh(now);

      localStorage.setItem(

        "lastRefresh",

        now.toISOString()

      );

    } catch (err) {

      console.error(err);

      setError(

        err.message ||

        "Unknown Error"

      );

    } finally {

      setLoading(false);

      refreshing.current = false;

    }

  }, [

    checkBackend,

    loadSpotPrices,

    loadScanner,

    options.length,

  ]);

  /* ============================================================
     Watchlist
  ============================================================ */

  const toggleWatchlist = useCallback((contractId) => {

    setWatchlist((previous) => {

      const updated = previous.includes(contractId)

        ? previous.filter(

            (id) => id !== contractId

          )

        : [

            ...previous,

            contractId,

          ];

      return updated;

    });

  }, []);

  /* ============================================================
     Persist Watchlist
  ============================================================ */

  useEffect(() => {

    localStorage.setItem(

      "watchlist",

      JSON.stringify(watchlist)

    );

  }, [watchlist]);

  /* ============================================================
     Persist Theme
  ============================================================ */

  useEffect(() => {

    localStorage.setItem(

      "theme",

      theme

    );

    document.documentElement.dataset.theme =

      theme;

  }, [theme]);

  /* ============================================================
     Persist Refresh Interval
  ============================================================ */

  useEffect(() => {

    localStorage.setItem(

      "refreshInterval",

      refreshInterval

    );

  }, [refreshInterval]);

  /* ============================================================
     Initial Load
  ============================================================ */

  useEffect(() => {

    refreshAll();

  }, [refreshAll]);

  /* ============================================================
     Auto Refresh
  ============================================================ */

  useEffect(() => {

    const timer = setInterval(() => {

      if (backendConnected) {

        refreshAll();

      }

    }, refreshInterval * 1000);

    return () => clearInterval(timer);

  }, [

    refreshAll,

    backendConnected,

    refreshInterval,

  ]);
  /* ============================================================
     Derived Values
  ============================================================ */

  const totalContracts = useMemo(
    () => options.length,
    [options]
  );

  /* ============================================================
     Context Value
  ============================================================ */

  const value = {

    /* ---------------------------------
       Scanner
    --------------------------------- */

    options,

    expiries,

    activeTab,

    setActiveTab,

    totalContracts,

    /* ---------------------------------
       Spot Prices
    --------------------------------- */

    spotPrices,

    /* ---------------------------------
       Filters
    --------------------------------- */

    filters,

    setFilters,

    /* ---------------------------------
       Loading
    --------------------------------- */

    loading,

    error,

    /* ---------------------------------
       Backend
    --------------------------------- */

    backendConnected,

    lastRefresh,

    /* ---------------------------------
       Settings
    --------------------------------- */

    refreshInterval,

    setRefreshInterval,

    theme,

    setTheme,

    /* ---------------------------------
       Watchlist
    --------------------------------- */

    watchlist,

    toggleWatchlist,

    /* ---------------------------------
       Refresh
    --------------------------------- */

    refreshAll,

    refreshScanner: loadScanner,

    refreshSpotPrices: loadSpotPrices,

  };

  /* ============================================================
     Provider
  ============================================================ */

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

    throw new Error(
      "useScanner must be used inside ScannerProvider"
    );

  }

  return context;

}