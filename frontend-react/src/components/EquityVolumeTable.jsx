import { useMemo, useState } from "react";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import EmptyState from "./EmptyState";

export default function EquityVolumeTable({ data = [] }) {
  const [sortField, setSortField] = useState("volumeRatio");
  const [sortDirection, setSortDirection] = useState("desc");

  const changeSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedData = useMemo(() => {
    const rows = [...data];
    rows.sort((a, b) => {
      let av = a?.[sortField];
      let bv = b?.[sortField];

      // Handle numeric sorting
      if (typeof av === "number" && typeof bv === "number") {
        return sortDirection === "asc" ? av - bv : bv - av;
      }

      // Handle string sorting
      return sortDirection === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [data, sortField, sortDirection]);

  const renderSortIcon = (field) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <FiChevronUp className="inline ml-1" size={14} />
    ) : (
      <FiChevronDown className="inline ml-1" size={14} />
    );
  };

  const number = (v, digits = 0) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "--";
    return Number(v).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const formatVolume = (v) => {
    if (v === null || v === undefined) return "--";
    // If volume is large, format as Millions / Thousands or keep full number
    if (v >= 10000000) return (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return (v / 100000).toFixed(2) + " Lk";
    return number(v);
  };

  if (!sortedData.length) {
    return (
      <EmptyState
        title="No Stocks Found"
        message="No equity volume surge records match the selected filters."
      />
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-900 z-10">
          <tr className="border-b border-slate-700 text-slate-300">
            <th className="cursor-pointer px-4 py-3 text-center w-16" onClick={() => changeSort("rank")}>
              Rank {renderSortIcon("rank")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-left" onClick={() => changeSort("symbol")}>
              Symbol {renderSortIcon("symbol")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-left" onClick={() => changeSort("companyName")}>
              Company Name {renderSortIcon("companyName")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-left" onClick={() => changeSort("sector")}>
              Sector {renderSortIcon("sector")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("currentPrice")}>
              Price {renderSortIcon("currentPrice")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("changePercent")}>
              Change % {renderSortIcon("changePercent")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("todayVolume")}>
              Today's Vol {renderSortIcon("todayVolume")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("fiveDayAvgVolume")}>
              5 Day Avg Vol {renderSortIcon("fiveDayAvgVolume")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("volumeRatio")}>
              Vol Ratio {renderSortIcon("volumeRatio")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-center" onClick={() => changeSort("signal")}>
              Signal {renderSortIcon("signal")}
            </th>
            <th className="cursor-pointer px-4 py-3 text-right" onClick={() => changeSort("smartScore")}>
              Smart Score {renderSortIcon("smartScore")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => {
            const signal = row.signal || "Neutral";
            const ratio = Number(row.volumeRatio ?? 0);
            const price = Number(row.currentPrice ?? 0);
            const changePercent = Number(row.changePercent ?? 0);
            const smartScore = Number(row.smartScore ?? 0);

            const signalColor =
              signal === "Strong Bullish"
                ? "bg-green-900 text-green-300 border-green-800"
                : signal === "Bullish"
                ? "bg-green-850/80 text-green-200 border-green-900"
                : signal === "Strong Bearish"
                ? "bg-red-900 text-red-300 border-red-800"
                : signal === "Bearish"
                ? "bg-red-850/80 text-red-200 border-red-900"
                : "bg-yellow-950/80 text-yellow-300 border-yellow-900";

            const changeColor = changePercent > 0 ? "text-green-400" : changePercent < 0 ? "text-red-400" : "text-slate-300";

            return (
              <tr key={row.symbol} className="border-b border-slate-800 transition hover:bg-slate-800/40">
                <td className="text-center font-semibold text-slate-400 py-3">
                  {row.rank}
                </td>
                <td className="font-bold text-white whitespace-nowrap px-4">
                  {row.symbol}
                </td>
                <td className="text-slate-300 max-w-xs truncate px-4">
                  {row.companyName}
                </td>
                <td className="text-slate-400 px-4">
                  {row.sector}
                </td>
                <td className="text-right font-medium text-white px-4">
                  ₹{number(price, 2)}
                </td>
                <td className={`text-right font-semibold px-4 ${changeColor}`}>
                  {changePercent > 0 ? "+" : ""}{number(changePercent, 2)}%
                </td>
                <td className="text-right text-slate-300 px-4">
                  {formatVolume(row.todayVolume)}
                </td>
                <td className="text-right text-slate-400 px-4">
                  {formatVolume(row.fiveDayAvgVolume)}
                </td>
                <td className="text-right px-4">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      ratio >= 3
                        ? "bg-green-950/60 text-green-400 border border-green-800/50"
                        : ratio >= 2
                        ? "bg-lime-950/60 text-lime-400 border border-lime-800/50"
                        : ratio >= 1.5
                        ? "bg-yellow-950/60 text-yellow-400 border border-yellow-800/50"
                        : "text-slate-400"
                    }`}
                  >
                    {number(ratio, 2)}x
                  </span>
                </td>
                <td className="text-center px-4">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${signalColor}`}>
                    {signal}
                  </span>
                </td>
                <td className="text-right font-bold text-cyan-400 px-4">
                  {number(smartScore, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
