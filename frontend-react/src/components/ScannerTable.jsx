import { FiStar } from "react-icons/fi";
import { useScanner } from "../context/ScannerContext";

export default function ScannerTable({ data = [] }) {
  const { watchlist, toggleWatchlist, loading } = useScanner();

import Loading from "./Loading";
import EmptyState from "./EmptyState";
  if (loading) {

    return <Loading />;

}

if (!data.length) {

    return (

        <EmptyState

            title="No Contracts"

            message="No option contracts match your filters."

        />

    );

}{
    return (
      <div className="flex justify-center py-10">
        <p className="text-slate-400">Loading scanner...</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex justify-center py-10">
        <p className="text-slate-500">
          No option contracts found.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-800">

      <table className="min-w-full border-collapse">

        <thead className="bg-slate-900 sticky top-0">

          <tr>

            <th className="px-3 py-3">⭐</th>

            <th className="px-3 py-3">Rank</th>

            <th className="px-3 py-3">Symbol</th>

            <th className="px-3 py-3">Category</th>

            <th className="px-3 py-3">Spot</th>

            <th className="px-3 py-3">Strike</th>

            <th className="px-3 py-3">Type</th>

            <th className="px-3 py-3">Expiry</th>

            <th className="px-3 py-3">LTP</th>

            <th className="px-3 py-3">Volume</th>

            <th className="px-3 py-3">Avg Vol</th>

            <th className="px-3 py-3">Ratio</th>

            <th className="px-3 py-3">OI</th>

            <th className="px-3 py-3">OI Chg</th>

            <th className="px-3 py-3">Smart Score</th>

            <th className="px-3 py-3">Signal</th>

          </tr>

        </thead>

        <tbody>

          {data.map((row) => {

            const starred = watchlist.includes(row.id);

            return (

              <tr
                key={row.id}
                className="border-b border-slate-800 hover:bg-slate-900"
              >

                <td className="text-center">

                  <button
                    onClick={() => toggleWatchlist(row.id)}
                  >
                    <FiStar
                      size={18}
                      className={
                        starred
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-slate-500"
                      }
                    />
                  </button>

                </td>

                <td>{row.rank}</td>

                <td>{row.symbol}</td>

                <td>{row.category}</td>

                <td>{row.spot?.toFixed(2)}</td>

                <td>{row.strike}</td>

                <td>

                  <span
                    className={
                      row.type === "CE"
                        ? "text-green-400 font-semibold"
                        : "text-red-400 font-semibold"
                    }
                  >
                    {row.type}
                  </span>

                </td>

                <td>{row.expiry}</td>

                <td>{row.price?.toFixed(2)}</td>

                <td>{row.volume?.toLocaleString()}</td>

                <td>{row.avgVol?.toLocaleString()}</td>

                <td>

                  <span
                    className={
                      row.volumeRatio >= 2
                        ? "text-green-400 font-bold"
                        : row.volumeRatio >= 1.5
                        ? "text-yellow-400 font-semibold"
                        : "text-slate-300"
                    }
                  >
                    {row.volumeRatio}x
                  </span>

                </td>

                <td>{row.oi?.toLocaleString()}</td>

                <td
                  className={
                    row.oiChange >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {row.oiChange?.toLocaleString()}
                </td>

                <td>

                  <span
                    className="font-bold text-cyan-400"
                  >
                    {row.smartScore?.toFixed(2)}
                  </span>

                </td>

                <td>

                  <span
                    className={
                      row.signal === "Strong Bullish"
                        ? "text-green-400 font-bold"

                        : row.signal === "Bullish"
                        ? "text-green-300"

                        : row.signal === "Bearish"
                        ? "text-red-300"

                        : row.signal === "Strong Bearish"
                        ? "text-red-500 font-bold"

                        : "text-yellow-300"
                    }
                  >
                    {row.signal}
                  </span>

                </td>

              </tr>

            );

          })}

        </tbody>

      </table>

    </div>
  );
}
