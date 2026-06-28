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

  /* ============================
     Active Scanner
  ============================ */

  const [activeTab, setActiveTab] = useState("all");

  /* ============================
     Market Data
  ============================ */

  const [options, setOptions] = useState([]);

  const [spotPrices, setSpotPrices] = useState({});

  const [expiries, setExpiries] = useState([]);

  /* ============================
     Loading
  ============================ */

  const [loading, setLoading] = useState(false);

  const [backendConnected, setBackendConnected] =
    useState(false);

  const [error, setError] = useState("");

  const [lastRefresh, setLastRefresh] =
    useState(null);

  /* ============================
     Filters
  ============================ */

  const [filters, setFilters] = useState({

    expiry: "",

    type: "ALL",

    signal: "ALL",

    search: "",

    minRatio: 1,

  });

  /* ============================
     Watchlist
  ============================ */

  const [watchlist, setWatchlist] = useState(() => {

    try {

      return JSON.parse(

        localStorage.getItem("watchlist") || "[]"

      );

    } catch {

      return [];

    }

  });

  /* ============================
     Prevent Multiple Refreshes
  ============================ */

  const refreshing = useRef(false);

  /* ============================
     Backend Health
  ============================ */

  const checkBackend = useCallback(async () => {

    try {

      const result = await pingBackend();

      const online =
        result?.status !== "offline";

      setBackendConnected(online);

      return online;

    } catch {

      setBackendConnected(false);

      return false;

    }

  }, []);

  /* ============================
     Spot Prices
  ============================ */

  const loadSpotPrices = useCallback(async () => {

    try {

      const response =
        await getSpotPrices([

          "NIFTY",

          "BANKNIFTY",

          "SENSEX",

        ]);

      setSpotPrices(

        response.spotPrices || {}

      );

    } catch (err) {

      console.error(err);

    }

  }, []);

  /* ============================
     Scanner Data
  ============================ */

  const loadScanner = useCallback(async () => {

    try {

      const symbols =

        activeTab === "index"

          ? [

              "NIFTY",

              "BANKNIFTY",

              "SENSEX",

            ]

          : [];

      const response =
        await getOptions({

          symbols,

          expiry:
            filters.expiry || null,

          mode: activeTab,

        });

      setOptions(

        response.options || []

      );

      setExpiries(

        response.expiries || []

      );

    } catch (err) {

      console.error(err);

    }

  }, [

    activeTab,

    filters.expiry,

  ]);
    /* ============================
     Refresh Everything
  ============================ */

  const refreshAll = useCallback(async () => {

    if (refreshing.current) return;

    refreshing.current = true;

    setLoading(true);

    setError("");

    try {

      const online = await checkBackend();

      if (!online) {

        setError("Backend Offline");

        setLoading(false);

        refreshing.current = false;

        return;

      }

      await Promise.all([

        loadSpotPrices(),

        loadScanner(),

      ]);

      setLastRefresh(new Date());

    } catch (err) {

      console.error(err);

      setError(err.message || "Unknown Error");

    } finally {

      setLoading(false);

      refreshing.current = false;

    }

  }, [

    checkBackend,

    loadSpotPrices,

    loadScanner,

  ]);

  /* ============================
     Toggle Watchlist
  ============================ */

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

      localStorage.setItem(

        "watchlist",

        JSON.stringify(updated)

      );

      return updated;

    });

  }, []);

  /* ============================
     Save Watchlist
  ============================ */

  useEffect(() => {

    localStorage.setItem(

      "watchlist",

      JSON.stringify(watchlist)

    );

  }, [watchlist]);

  /* ============================
     Initial Load
  ============================ */

  useEffect(() => {

    refreshAll();

  }, [refreshAll]);

  /* ============================
     Refresh on Scanner Change
  ============================ */

  useEffect(() => {

    refreshAll();

  }, [

    activeTab,

    filters.expiry,

  ]);

  /* ============================
     Auto Refresh
  ============================ */

  useEffect(() => {

    const timer = setInterval(() => {

      refreshAll();

    }, 10000);

    return () => clearInterval(timer);

  }, [refreshAll]);
    /* ============================
     Context Value
  ============================ */

  const value = {

    /* ------------------------
       Scanner
    ------------------------ */

    options,

    expiries,

    activeTab,

    setActiveTab,

    /* ------------------------
       Spot Prices
    ------------------------ */

    spotPrices,

    /* ------------------------
       Filters
    ------------------------ */

    filters,

    setFilters,

    /* ------------------------
       Loading
    ------------------------ */

    loading,

    error,

    /* ------------------------
       Backend
    ------------------------ */

    backendConnected,

    lastRefresh,

    /* ------------------------
       Watchlist
    ------------------------ */

    watchlist,

    toggleWatchlist,

    /* ------------------------
       Refresh
    ------------------------ */

    refreshAll,

    refreshScanner: loadScanner,

    refreshSpotPrices: loadSpotPrices,

  };

  return (

    <ScannerContext.Provider value={value}>

      {children}

    </ScannerContext.Provider>

  );

}

/* ============================================================
   Hook
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