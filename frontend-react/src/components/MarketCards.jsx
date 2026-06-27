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
    marketMode,
  } = useScanner();

  const cards = [
    {
      key: "NIFTY",
      title: "NIFTY",
      icon: <FiTrendingUp />,
    },
    {
      key: "BANKNIFTY",
      title: "BANKNIFTY",
      icon: <FiTrendingUp />,
    },
    {
      key: "SENSEX",
      title: "SENSEX",
      icon: <FiTrendingUp />,
    },
  ];

  const now = new Date().toLocaleTimeString();

  return (
    <div className="space-y-4">

      {/* Index Cards */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {cards.map((item) => {

          const value = spotPrices[item.key];

          const price =
            value?.ltp ??
            value?.price ??
            0;

          const change =
            value?.change ??
            0;

          const percent =
            value?.changePercent ??
            value?.percent ??
            0;

          const positive = change >= 0;

          return (

            <div
              key={item.key}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow"
            >

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-slate-400">
                    {item.title}
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">

                    {Number(price).toLocaleString()}

                  </h2>

                </div>

                <div className="rounded-full bg-slate-800 p-3 text-cyan-400">

                  {item.icon}

                </div>

              </div>

              <div className="mt-4">

                <span
                  className={
                    positive
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {positive ? "+" : ""}
                  {change.toFixed(2)}
                </span>

                <span className="ml-3 text-slate-400">

                  ({positive ? "+" : ""}
                  {percent.toFixed(2)}%)

                </span>

              </div>

            </div>

          );

        })}

      </div>

      {/* Status Cards */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiWifi className="text-green-400" />

            <div>

              <p className="text-sm text-slate-400">
                Backend
              </p>

              <h3 className="font-semibold text-green-400">

                Connected

              </h3>

            </div>

          </div>

        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiActivity className="text-cyan-400" />

            <div>

              <p className="text-sm text-slate-400">

                Scanner

              </p>

              <h3 className="font-semibold">

                {marketMode}

              </h3>

            </div>

          </div>

        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

          <div className="flex items-center gap-3">

            <FiClock className="text-yellow-400" />

            <div>

              <p className="text-sm text-slate-400">

                Last Refresh

              </p>

              <h3 className="font-semibold">

                {now}

              </h3>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
