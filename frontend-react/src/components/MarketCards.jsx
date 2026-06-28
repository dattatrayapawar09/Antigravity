import {
  FiActivity,
  FiClock,
  FiTrendingUp,
  FiTrendingDown,
  FiWifi,
} from "react-icons/fi";

import { useScanner } from "../context/ScannerContext";

export default function MarketCards() {
  const {
    spotPrices,
    activeTab,
    backendConnected,
    lastRefresh,
  } = useScanner();

  const cards = [
    {
      key: "NIFTY",
      title: "NIFTY",
    },
    {
      key: "BANKNIFTY",
      title: "BANKNIFTY",
    },
    {
      key: "SENSEX",
      title: "SENSEX",
    },
  ];

  const refreshTime = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString()
    : "--:--:--";

  return (
    <div className="space-y-4">

      {/* ===========================
          Index Cards
      ============================ */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {cards.map((item) => {

          const value = spotPrices[item.key];

          /*
          ----------------------------------------------------
          Supports BOTH backend formats

          Format 1:
          spotPrices:
          {
             "NIFTY":25120.35
          }

          Format 2:
          spotPrices:
          {
             "NIFTY":{
                 ltp:25120,
                 change:122,
                 changePercent:0.45
             }
          }
          ----------------------------------------------------
          */

          const price =
            typeof value === "number"
              ? value
              : value?.ltp ??
                value?.price ??
                0;

          const change =
            typeof value === "number"
              ? 0
              : value?.change ??
                0;

          const percent =
            typeof value === "number"
              ? 0
              : value?.changePercent ??
                value?.percent ??
                0;

          const positive = change >= 0;

          return (

            <div
              key={item.key}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg"
            >

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-slate-400">
                    {item.title}
                  </p>

                  <h2 className="mt-2 text-3xl font-bold text-white">

                    {Number(price).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}

                  </h2>

                </div>

                <div
                  className={`rounded-full p-3 ${
                    positive
                      ? "bg-green-900 text-green-400"
                      : "bg-red-900 text-red-400"
                  }`}
                >
                  {positive ? (
                    <FiTrendingUp size={24} />
                  ) : (
                    <FiTrendingDown size={24} />
                  )}
                </div>

              </div>

              <div className="mt-5 flex items-center gap-3">

                <span
                  className={`font-semibold ${
                    positive
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {positive ? "+" : ""}
                  {Number(change).toFixed(2)}
                </span>

                <span
                  className={`text-sm ${
                    positive
                      ? "text-green-300"
                      : "text-red-300"
                  }`}
                >
                  (
                  {positive ? "+" : ""}
                  {Number(percent).toFixed(2)}
                  %)
                </span>

              </div>

            </div>

          );

        })}

      </div>

      {/* ===========================
          Status Cards
      ============================ */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Backend */}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiWifi
              className={
                backendConnected
                  ? "text-green-400"
                  : "text-red-400"
              }
              size={22}
            />

            <div>

              <p className="text-sm text-slate-400">
                Backend
              </p>

              <h3
                className={`font-semibold ${
                  backendConnected
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {backendConnected
                  ? "Connected"
                  : "Offline"}
              </h3>

            </div>

          </div>

        </div>

        {/* Scanner Mode */}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiActivity
              className="text-cyan-400"
              size={22}
            />

            <div>

              <p className="text-sm text-slate-400">
                Scanner
              </p>

              <h3 className="font-semibold text-white">

                {activeTab.toUpperCase()}

              </h3>

            </div>

          </div>

        </div>

        {/* Last Refresh */}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiClock
              className="text-yellow-400"
              size={22}
            />

            <div>

              <p className="text-sm text-slate-400">
                Last Refresh
              </p>

              <h3 className="font-semibold text-white">

                {refreshTime}

              </h3>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}