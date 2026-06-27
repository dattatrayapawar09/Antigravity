import { FiStar } from "react-icons/fi";

import Loading from "./Loading";
import EmptyState from "./EmptyState";

import { useScanner } from "../context/ScannerContext";

export default function ScannerTable({ data = [] }) {
  const {
    loading,
    watchlist,
    toggleWatchlist,
  } = useScanner();

  if (loading) {
    return <Loading />;
  }

  if (!data.length) {
    return (
      <EmptyState
        title="No Contracts Found"
        message="No option contracts match the selected filters."
      />
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 shadow-lg">

      <table className="min-w-full border-collapse">

        <thead className="sticky top-0 bg-slate-900">

          <tr className="text-sm">

            <th className="px-3 py-3">⭐</th>

            <th className="px-3 py-3">Rank</th>

            <th className="px-3 py-3">Symbol</th>

            <th className="px-3 py-3">Category</th>

            <th className="px-3 py-3 text-right">Spot</th>

            <th className="px-3 py-3 text-right">Strike</th>

            <th className="px-3 py-3">Type</th>

            <th className="px-3 py-3">Expiry</th>

            <th className="px-3 py-3 text-right">LTP</th>

            <th className="px-3 py-3 text-right">Volume</th>

            <th className="px-3 py-3 text-right">Avg Vol</th>

            <th className="px-3 py-3 text-right">Ratio</th>

            <th className="px-3 py-3 text-right">OI</th>

            <th className="px-3 py-3 text-right">OI Chg</th>

            <th className="px-3 py-3 text-right">Smart</th>

            <th className="px-3 py-3">Signal</th>

          </tr>

        </thead>

        <tbody>

          {data.map((row) => {

            const favourite = watchlist.includes(row.id);

            return (

              <tr
                key={row.id}
                className="border-b border-slate-800 transition hover:bg-slate-900"
              >

                <td className="text-center">

                  <button
                    onClick={() => toggleWatchlist(row.id)}
                  >
                    <FiStar
                      size={18}
                      className={
                        favourite
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-slate-500 hover:text-yellow-400"
                      }
                    />
                  </button>

                </td>

                <td className="text-center">{row.rank}</td>

                <td className="font-semibold">
                  {row.symbol}
                </td>

                <td>{row.category}</td>

                <td className="text-right">
                  {Number(row.spot).toLocaleString()}
                </td>

                <td className="text-right">
                  {row.strike}
                </td>

                <td>

                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      row.type === "CE"
                        ? "bg-green-900 text-green-300"
                        : "bg-red-900 text-red-300"
                    }`}
                  >
                    {row.type}
                  </span>

                </td>

                <td>{row.expiry}</td>

                <td className="text-right">
                  ₹{Number(row.price).toFixed(2)}
                </td>

                <td className="text-right">
                  {Number(row.volume).toLocaleString()}
                </td>

                <td className="text-right">
                  {Number(row.avgVol).toLocaleString()}
                </td>

                <td className="text-right">

                  <span
                    className={
                      row.volumeRatio >= 2
                        ? "font-bold text-green-400"
                        : row.volumeRatio >= 1.5
                        ? "font-semibold text-yellow-400"
                        : "text-slate-300"
                    }
                  >
                    {Number(row.volumeRatio).toFixed(2)}x
                  </span>

                </td>

                <td className="text-right">
                  {Number(row.oi).toLocaleString()}
                </td>

                <td
                  className={`text-right ${
                    row.oiChange >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {Number(row.oiChange).toLocaleString()}
                </td>

                <td className="text-right font-bold text-cyan-400">
                  {Number(row.smartScore).toFixed(2)}
                </td>

                <td>

                  <span
                    className={`font-semibold ${
                      row.signal === "Strong Bullish"
                        ? "text-green-400"
                        : row.signal === "Bullish"
                        ? "text-green-300"
                        : row.signal === "Bearish"
                        ? "text-red-300"
                        : row.signal === "Strong Bearish"
                        ? "text-red-500"
                        : "text-yellow-300"
                    }`}
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
