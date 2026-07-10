import {
  FiActivity,
  FiClock,
  FiDatabase,
  FiWifi,
  FiWifiOff,
} from "react-icons/fi";

import { useMemo } from "react";

import { useScanner } from "../context/ScannerContext";

export default function StatusBar() {

  const {

    options,

    activeTab,

    backendConnected,

    loading,

    lastRefresh,

  } = useScanner();

  const refreshTime = useMemo(() => {

    if (!lastRefresh)
      return "--:--:--";

    return new Date(
      lastRefresh
    ).toLocaleTimeString();

  }, [lastRefresh]);

  return (

    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 px-6 py-3">

      <div className="flex flex-wrap items-center justify-between gap-4">

        {/* Backend */}

        <div className="flex items-center gap-2">

          {backendConnected ? (

            <FiWifi className="text-green-400" />

          ) : (

            <FiWifiOff className="text-red-400" />

          )}

          <span className="text-slate-400">

            Backend

          </span>

          <span
            className={
              backendConnected
                ? "font-semibold text-green-400"
                : "font-semibold text-red-400"
            }
          >

            {backendConnected
              ? "Connected"
              : "Offline"}

          </span>

        </div>

        {/* Scanner */}

        <div className="flex items-center gap-2">

          <FiActivity className="text-cyan-400" />

          <span className="text-slate-400">

            Scanner

          </span>

          <span className="font-semibold capitalize">

            {activeTab}

          </span>

        </div>

        {/* Contracts */}

        <div className="flex items-center gap-2">

          <FiDatabase className="text-yellow-400" />

          <span className="text-slate-400">

            Contracts

          </span>

          <span className="font-semibold">

            {options.length}

          </span>

        </div>

        {/* Refresh Status */}

        <div className="flex items-center gap-2">

          <FiClock className="text-cyan-400" />

          <span className="text-slate-400">

            Last Refresh

          </span>

          <span
            className={
              loading
                ? "text-yellow-400"
                : "text-green-400"
            }
          >

            {loading
              ? "Refreshing..."
              : refreshTime}

          </span>

        </div>

      </div>

    </div>

  );

}