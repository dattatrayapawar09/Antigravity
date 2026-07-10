import { useMemo, useState } from "react";
import {
  FiStar,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";

import Loading from "./Loading";
import EmptyState from "./EmptyState";

import { useScanner } from "../context/ScannerContext";

export default function ScannerTable({ data = [] }) {
  const {
    loading,
    watchlist,
    toggleWatchlist,
  } = useScanner();

  /* ==========================================================
      Sorting
  ========================================================== */

  const [sortField, setSortField] = useState("smartScore");
  const [sortDirection, setSortDirection] = useState("desc");

  const changeSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) =>
        prev === "asc" ? "desc" : "asc"
      );
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };
  const sortedData = useMemo(() => {
    const rows = [...data];

    rows.sort((a, b) => {
      const av = a?.[sortField];
      const bv = b?.[sortField];

      if (typeof av === "number" && typeof bv === "number") {
        return sortDirection === "asc"
          ? av - bv
          : bv - av;
      }

      return sortDirection === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [data, sortField, sortDirection]);

  /* ==========================================================
      Loading
  ========================================================== */

  if (loading) {
    return <Loading />;
  }

  if (!sortedData.length) {
    return (
      <EmptyState
        title="No Contracts Found"
        message="No option contracts match the selected filters."
      />
    );
  }

  /* ==========================================================
      Helpers
  ========================================================== */

  const renderSortIcon = (field) => {
    if (sortField !== field) return null;

    return sortDirection === "asc" ? (
      <FiChevronUp className="inline ml-1" size={14} />
    ) : (
      <FiChevronDown className="inline ml-1" size={14} />
    );
  };

  const number = (v, digits = 0) => {
    if (v === null || v === undefined || Number.isNaN(Number(v)))
      return "--";

    return Number(v).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 shadow-lg">

      <table className="min-w-full border-collapse text-sm">

        <thead className="sticky top-0 bg-slate-900 z-10">

          <tr className="border-b border-slate-700 text-slate-300">

            <th className="px-3 py-3 w-12">★</th>

            <th
              className="cursor-pointer px-3 py-3"
              onClick={() => changeSort("rank")}
            >
              Rank {renderSortIcon("rank")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-left"
              onClick={() => changeSort("symbol")}
            >
              Symbol {renderSortIcon("symbol")}
            </th>

            <th className="px-3 py-3">
              Category
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("spot")}
            >
              Spot {renderSortIcon("spot")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("strike")}
            >
              Strike {renderSortIcon("strike")}
            </th>

            <th className="px-3 py-3">
              Type
            </th>

            <th className="px-3 py-3">
              Expiry
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("price")}
            >
              LTP {renderSortIcon("price")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("volume")}
            >
              Volume {renderSortIcon("volume")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("avgVol")}
            >
              Avg Vol {renderSortIcon("avgVol")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("volumeRatio")}
            >
              Ratio {renderSortIcon("volumeRatio")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("oi")}
            >
              OI {renderSortIcon("oi")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("oiChange")}
            >
              OI Chg {renderSortIcon("oiChange")}
            </th>

            <th
              className="cursor-pointer px-3 py-3 text-right"
              onClick={() => changeSort("smartScore")}
            >
              Smart {renderSortIcon("smartScore")}
            </th>

            <th className="px-3 py-3">
              Signal
            </th>

          </tr>

        </thead>

        <tbody>
{sortedData.map((row) => {

  const id =
    row.id ??
    row.contractId ??
    `${row.symbol}_${row.strike}_${row.type}`;

  const favourite =
    watchlist.includes(id);

  const signal = row.signal || "Neutral";

  const smartScore =
    Number(row.smartScore ?? 0);

  const ratio =
    Number(
      row.volumeRatio ??
      row.volRatio ??
      0
    );

  const oiChange =
    Number(
      row.oiChange ??
      row.oi_change ??
      0
    );

  const positiveOI =
    oiChange >= 0;

  const signalColor =
    signal === "Strong Bullish"
      ? "bg-green-900 text-green-300"
      : signal === "Bullish"
      ? "bg-green-800 text-green-200"
      : signal === "Strong Bearish"
      ? "bg-red-900 text-red-300"
      : signal === "Bearish"
      ? "bg-red-800 text-red-200"
      : "bg-yellow-900 text-yellow-300";

  const scoreColor =
    smartScore >= 80
      ? "text-green-400"
      : smartScore >= 60
      ? "text-c
              <td className="text-center">
                <button
                  onClick={() => toggleWatchlist(id)}
                  className="transition hover:scale-110"
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

              <td className="text-center font-semibold">
                {row.rank}
              </td>

              <td className="font-semibold whitespace-nowrap">
                {row.symbol ?? "--"}
              </td>

              <td>
                <span className="rounded bg-slate-800 px-2 py-1 text-xs">
                  {row.category ?? "--"}
                </span>
              </td>

              <td className="text-right">
                {number(row.spot, 2)}
              </td>

              <td className="text-right font-medium">
                {number(row.strike, 0)}
              </td>

              <td className="text-center">
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

              <td className="whitespace-nowrap">
                {row.expiry ?? "--"}
              </td>

              <td className="text-right font-semibold">
                ₹{number(row.price ?? row.ltp, 2)}
              </td>

              <td className="text-right">
                {number(row.volume)}
              </td>

              <td className="text-right">
                {number(
                  row.avgVol ??
                  row.avgVolume
                )}
              </td>

              <td className="text-right">
                <span
                  className={
                    ratio >= 3
                      ? "font-bold text-green-400"
                      : ratio >= 2
                      ? "font-semibold text-lime-400"
                      : ratio >= 1.5
                      ? "font-semibold text-yellow-400"
                      : "text-slate-300"
                  }
                >
                  {number(ratio, 2)}x
                </span>
              </td>

              <td className="text-right">
                {number(row.oi)}
              </td>

              <td
                className={`text-right font-medium ${
                  positiveOI
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {positiveOI ? "+" : ""}
                {number(oiChange)}
              </td>

              <td
                className={`text-right font-bold ${scoreColor}`}
              >
                {number(smartScore, 2)}
              </td>

              <td>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${signalColor}`}
                >
                  {signal}
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