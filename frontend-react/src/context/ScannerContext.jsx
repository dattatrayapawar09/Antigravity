import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";

import {
    getOptions,
    getSpotPrices,
    pingBackend,
} from "../api/api";

/*
|--------------------------------------------------------------------------
| Scanner Context
|--------------------------------------------------------------------------
*/

const ScannerContext = createContext(null);

/*
|--------------------------------------------------------------------------
| Provider
|--------------------------------------------------------------------------
*/

export function ScannerProvider({ children }) {

    /*
    |--------------------------------------------------------------------------
    | Scanner Mode
    |--------------------------------------------------------------------------
    */

    const [activeTab, setActiveTab] = useState("all");

    /*
    |--------------------------------------------------------------------------
    | Data
    |--------------------------------------------------------------------------
    */

    const [options, setOptions] = useState([]);

    const [expiries, setExpiries] = useState([]);

    const [spotPrices, setSpotPrices] = useState({});

    /*
    |--------------------------------------------------------------------------
    | UI State
    |--------------------------------------------------------------------------
    */

    const [loading, setLoading] = useState(false);

    const [backendConnected, setBackendConnected] = useState(false);

    const [lastRefresh, setLastRefresh] = useState(null);

    /*
    |--------------------------------------------------------------------------
    | Watchlist
    |--------------------------------------------------------------------------
    */

    const [watchlist, setWatchlist] = useState(() => {

        const saved = localStorage.getItem("watchlist");

        if (!saved) return [];

        try {

            return JSON.parse(saved);

        } catch {

            return [];

        }

    });

    /*
    |--------------------------------------------------------------------------
    | Filters
    |--------------------------------------------------------------------------
    */

    const [filters, setFilters] = useState({

        expiry: "",

        type: "ALL",

        search: "",

        minRatio: 1,

        signal: "ALL",

    });

    /*
    |--------------------------------------------------------------------------
    | Backend Health
    |--------------------------------------------------------------------------
    */

    const checkBackend = useCallback(async () => {

        try {

            const result = await pingBackend();

            setBackendConnected(
                result?.status !== "offline"
            );

        } catch {

            setBackendConnected(false);

        }

    }, []);

    /*
    |--------------------------------------------------------------------------
    | Load Scanner
    |--------------------------------------------------------------------------
    */

    const refreshScanner = useCallback(async () => {

        try {

            setLoading(true);

            const symbols =
                activeTab === "index"
                    ? [
                          "NIFTY",
                          "BANKNIFTY",
                          "SENSEX",
                      ]
                    : [];

            const result = await getOptions({

                symbols,

                expiry:
                    filters.expiry || null,

                mode: activeTab,

            });

            setOptions(result.options || []);

            setExpiries(result.expiries || []);

            setLastRefresh(
                new Date()
            );

        } catch (err) {

            console.error(err);

        } finally {

            setLoading(false);

        }

    }, [

        activeTab,

        filters.expiry,

    ]);

    /*
    |--------------------------------------------------------------------------
    | Spot Prices
    |--------------------------------------------------------------------------
    */

    const refreshSpotPrices = useCallback(async () => {

        try {

            const symbols = [

                "NIFTY",

                "BANKNIFTY",

                "SENSEX",

            ];

            const result =
                await getSpotPrices(symbols);

            setSpotPrices(
                result.spotPrices || {}
            );

        } catch (err) {

            console.error(err);

        }

    }, []);
        /*
    |--------------------------------------------------------------------------
    | Toggle Watchlist
    |--------------------------------------------------------------------------
    */

    const toggleWatchlist = useCallback((contractId) => {

        setWatchlist((previous) => {

            const updated = previous.includes(contractId)
                ? previous.filter((id) => id !== contractId)
                : [...previous, contractId];

            localStorage.setItem(
                "watchlist",
                JSON.stringify(updated)
            );

            return updated;

        });

    }, []);

    /*
    |--------------------------------------------------------------------------
    | Refresh Everything
    |--------------------------------------------------------------------------
    */

    const refreshAll = useCallback(async () => {

        await checkBackend();

        if (!backendConnected) return;

        await Promise.all([
            refreshScanner(),
            refreshSpotPrices(),
        ]);

    }, [
        backendConnected,
        checkBackend,
        refreshScanner,
        refreshSpotPrices,
    ]);

    /*
    |--------------------------------------------------------------------------
    | Initial Load
    |--------------------------------------------------------------------------
    */

    useEffect(() => {

        checkBackend();

    }, [checkBackend]);

    useEffect(() => {

        if (backendConnected) {

            refreshScanner();

            refreshSpotPrices();

        }

    }, [
        backendConnected,
        refreshScanner,
        refreshSpotPrices,
    ]);

    /*
    |--------------------------------------------------------------------------
    | Auto Refresh
    |--------------------------------------------------------------------------
    */

    useEffect(() => {

        if (!backendConnected) return;

        const timer = setInterval(() => {

            refreshScanner();

            refreshSpotPrices();

        }, 10000);

        return () => clearInterval(timer);

    }, [
        backendConnected,
        refreshScanner,
        refreshSpotPrices,
    ]);

    /*
    |--------------------------------------------------------------------------
    | Context Value
    |--------------------------------------------------------------------------
    */

    const value = {

        /*
        --------------------
        Scanner
        --------------------
        */

        options,

        expiries,

        activeTab,

        setActiveTab,

        refreshScanner,

        /*
        --------------------
        Spot
        --------------------
        */

        spotPrices,

        refreshSpotPrices,

        /*
        --------------------
        Backend
        --------------------
        */

        backendConnected,

        lastRefresh,

        /*
        --------------------
        Loading
        --------------------
        */

        loading,

        /*
        --------------------
        Watchlist
        --------------------
        */

        watchlist,

        toggleWatchlist,

        /*
        --------------------
        Filters
        --------------------
        */

        filters,

        setFilters,

        /*
        --------------------
        Helpers
        --------------------
        */

        refreshAll,

    };

    return (

        <ScannerContext.Provider value={value}>

            {children}

        </ScannerContext.Provider>

    );

}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useScanner() {

    const context = useContext(ScannerContext);

    if (!context) {

        throw new Error(
            "useScanner must be used inside ScannerProvider"
        );

    }

    return context;

}