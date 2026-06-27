import { useMemo } from "react";

import { useScanner } from "../context/ScannerContext";

import MarketCards from "../components/MarketCards";
import ScannerTable from "../components/ScannerTable";

export default function Watchlist() {
  const {
    options,
    watchlist,
  } = useScanner();

  const watchlistOptions = useMemo(() => {
    return options.filter((option) =>
      watchlist.includes(option.id)
    );
  }, [options, watchlist]);

  return (
    <div className="space-y-6">

      {/* Page Header */}

      <div>

        <h1 className="text-3xl font-bold">
          ⭐ Watchlist
        </h1>

        <p className="mt-1 text-slate-400">
          Your favourite option contracts with live updates.
        </p>

      </div>

      <MarketCards />

      {watchlistOptions.length === 0 ? (

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center">

          <h2 className="text-xl font-semibold">
            No contracts in Watchlist
          </h2>

          <p className="mt-2 text-slate-400">
            Click the ⭐ icon in any scanner to add contracts here.
          </p>

        </div>

      ) : (

        <ScannerTable
          data={watchlistOptions}
        />

      )}

    </div>
  );
}
