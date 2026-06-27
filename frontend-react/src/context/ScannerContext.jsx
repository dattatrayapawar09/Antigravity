import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  getSpotPrices,
  getOptions,
} from "../api/api";

const ScannerContext = createContext(null);

export function ScannerProvider({ children }) {
  /*
  ---------------------------------------
  UI State
  ---------------------------------------
  */

  const [activeTab, setActiveTab] = useState("stocks");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  /*
  ---------------------------------------
  Market Data
  ---------------------------------------
  */

  const [spotPrices, setSpotPrices] = useState({});

  const [options, setOptions] = useState([]);

  const [expiries, setExpiries] = useState([]);

  const [marketMode, setMarketMode] = useState("LIVE");

  /*
  ---------------------------------------
  Watchlist
  ---------------------------------------
  */

  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem("watchlist");

    return saved ? JSON.parse(saved) : [];
  });

  /*
  ---------------------------------------
  Settings
  ---------------------------------------
  */

  const [refreshInterval, setRefreshInterval] = useState(10);

  const [theme, setTheme] = useState("dark");

  /*
  ---------------------------------------
  Symbols
  ---------------------------------------
  */

  const defaultSymbols = [
    "NIFTY",
    "BANKNIFTY",
    "SENSEX",
  ];

  /*
  ---------------------------------------
  Load Spot Prices
  ---------------------------------------
  */

  const refreshSpotPrices = useCallback(async () => {
    try {
      const data = await getSpotPrices(defaultSymbols);

      setSpotPrices(data.spotPrices || {});
    } catch (err) {
      console.error(err);
    }
  }, []);

  /*
  ---------------------------------------
  Load Scanner
  ---------------------------------------
  */

  const refreshScanner = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getOptions(
        defaultSymbols,
        null,
        activeTab
      );

      setOptions(data.options || []);

      setExpiries(data.expiries || []);

      setMarketMode(data.mode || "LIVE");

      setError(null);
    } catch (err) {
      console.error(err);

      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  /*
  ---------------------------------------
  Auto Refresh
  ---------------------------------------
  */

  useEffect(() => {
    refreshSpotPrices();

    refreshScanner();

    const timer = setInterval(() => {
      refreshSpotPrices();

      refreshScanner();
    }, refreshInterval * 1000);

    return () => clearInterval(timer);
  }, [
    refreshSpotPrices,
    refreshScanner,
    refreshInterval,
  ]);

  /*
  ---------------------------------------
  Save Watchlist
  ---------------------------------------
  */

  useEffect(() => {
    localStorage.setItem(
      "watchlist",
      JSON.stringify(watchlist)
    );
  }, [watchlist]);

  /*
  ---------------------------------------
  Toggle Watchlist
  ---------------------------------------
  */

  const toggleWatchlist = (id) => {
    setWatchlist((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }

      return [...prev, id];
    });
  };

  return (
    <ScannerContext.Provider
      value={{
        loading,
        error,

        activeTab,
        setActiveTab,

        spotPrices,

        options,

        expiries,

        marketMode,

        watchlist,

        toggleWatchlist,

        refreshInterval,
        setRefreshInterval,

        theme,
        setTheme,

        refreshScanner,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  return useContext(ScannerContext);
}
