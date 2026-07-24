import { useState, useRef, useCallback } from "react";
import { FiChevronUp, FiChevronDown, FiInfo } from "react-icons/fi";
import EmptyState from "./EmptyState";

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

function fmt(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "–";
  return Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtVol(v) {
  if (!v && v !== 0) return "–";
  if (v >= 10_000_000) return (v / 10_000_000).toFixed(2) + " Cr";
  if (v >= 100_000)    return (v / 100_000).toFixed(2) + " Lk";
  return fmt(v);
}

/* ─────────────────────────────────────────────────────────────
   Signal Badge
───────────────────────────────────────────────────────────── */

function SignalBadge({ signal }) {
  const cls =
    signal === "Strong Reversal"
      ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
      : signal === "Reversal"
      ? "bg-green-950/80 text-green-300 border-green-800/60"
      : signal === "Watch"
      ? "bg-amber-950/80 text-amber-300 border-amber-800/60"
      : "bg-slate-800/80 text-slate-400 border-slate-700/60";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {signal}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Score Badge
───────────────────────────────────────────────────────────── */

function ScoreBadge({ score }) {
  const n = Number(score ?? 0);
  const cls =
    n >= 90
      ? "text-emerald-400 font-bold"
      : n >= 75
      ? "text-green-400 font-bold"
      : n >= 60
      ? "text-amber-400 font-semibold"
      : "text-slate-400 font-semibold";
  return <span className={cls}>{fmt(n, 1)}</span>;
}

/* ─────────────────────────────────────────────────────────────
   Volume Tooltip (hover over Avg Vol)
───────────────────────────────────────────────────────────── */

function VolumeTooltip({ stock, children }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  return (
    <span
      ref={ref}
      className="relative inline-block cursor-pointer"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs shadow-2xl">
          <p className="mb-2 font-semibold text-slate-200">Volume Details</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Today's Volume</span>
              <span className="font-medium text-white">{fmtVol(stock.todayVolume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Yesterday</span>
              <span className="font-medium text-white">{fmtVol(stock.yesterdayVolume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">5D Average</span>
              <span className="font-medium text-cyan-300">{fmtVol(stock.avgVolume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Volume Ratio</span>
              <span className="font-bold text-green-400">{fmt(stock.volumeRatio, 2)}x</span>
            </div>
          </div>
          {stock.volumeHistory?.length > 0 && (
            <div className="mt-3 border-t border-slate-700 pt-2">
              <p className="mb-1 text-slate-500">Last sessions</p>
              <div className="flex items-end gap-0.5" style={{ height: 28 }}>
                {stock.volumeHistory.map((v, i) => {
                  const maxV = Math.max(...stock.volumeHistory, 1);
                  const h = Math.max(4, Math.round((v / maxV) * 28));
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-cyan-600/70"
                      style={{ height: h }}
                      title={fmtVol(v)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Recent High Tooltip
───────────────────────────────────────────────────────────── */

function RecentHighTooltip({ stock, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="relative inline-block cursor-pointer"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs shadow-2xl">
          <p className="mb-2 font-semibold text-slate-200">Swing High Details</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Recent High</span>
              <span className="font-bold text-white">₹{fmt(stock.recentHigh, 2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Date</span>
              <span className="text-slate-300">{stock.recentHighDate || "–"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Current</span>
              <span className="font-medium text-white">₹{fmt(stock.currentPrice, 2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Drop</span>
              <span className="font-bold text-red-400">{fmt(stock.priceDropPercent, 2)}%</span>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Column definitions
───────────────────────────────────────────────────────────── */

const COLUMNS = [
  { key: "rank",             label: "Rank",        align: "center" },
  { key: "symbol",           label: "Symbol",      align: "left"   },
  { key: "company",          label: "Company",     align: "left"   },
  { key: "recentHigh",       label: "Recent High", align: "right"  },
  { key: "currentPrice",     label: "Price",       align: "right"  },
  { key: "priceDropPercent", label: "% Drop",      align: "right"  },
  { key: "todayVolume",      label: "Today Vol",   align: "right"  },
  { key: "avgVolume",        label: "5D Avg Vol",  align: "right"  },
  { key: "volumeRatio",      label: "Vol Ratio",   align: "right"  },
  { key: "todayOpen",        label: "Open",        align: "right"  },
  { key: "todayHigh",        label: "High",        align: "right"  },
  { key: "todayLow",         label: "Low",         align: "right"  },
  { key: "todayClose",       label: "Close",       align: "right"  },
  { key: "closePosition",    label: "Close Pos",   align: "right"  },
  { key: "score",            label: "Score",       align: "right"  },
  { key: "signal",           label: "Signal",      align: "center" },
];

/* ─────────────────────────────────────────────────────────────
   Main Table
───────────────────────────────────────────────────────────── */

export default function SmartReversalTable({ data = [] }) {
  const [sortField, setSortField] = useState("score");
  const [sortDir,   setSortDir  ] = useState("desc");

  const toggleSort = useCallback(
    (field) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  const sorted = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <FiChevronUp className="ml-1 inline" size={12} />
    ) : (
      <FiChevronDown className="ml-1 inline" size={12} />
    );
  };

  if (!sorted.length) {
    return (
      <EmptyState
        title="No Reversals Found"
        message="No F&O stocks match the selected Smart Reversal criteria. Try relaxing filters."
      />
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm">
          <tr className="border-b border-slate-700 text-slate-400">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-3 text-${col.align} font-semibold text-xs uppercase tracking-wider transition hover:text-white`}
              >
                {col.label}
                <SortIcon field={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const drop = Number(row.priceDropPercent ?? 0);
            const vr   = Number(row.volumeRatio ?? 0);
            const cp   = Number(row.closePosition ?? 0);

            const vrColor =
              vr >= 3
                ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/40"
                : vr >= 2
                ? "bg-green-950/50 text-green-300 border-green-800/40"
                : vr >= 1.5
                ? "bg-amber-950/50 text-amber-300 border-amber-800/40"
                : "text-slate-400";

            const cpColor =
              cp >= 80
                ? "text-emerald-400 font-bold"
                : cp >= 70
                ? "text-green-400 font-semibold"
                : cp >= 60
                ? "text-amber-400"
                : "text-slate-400";

            return (
              <tr
                key={`${row.symbol}-${i}`}
                className="border-b border-slate-800 transition-colors hover:bg-slate-800/50"
              >
                {/* Rank */}
                <td className="px-3 py-3 text-center text-slate-500 font-semibold">
                  {row.rank || i + 1}
                </td>

                {/* Symbol */}
                <td className="whitespace-nowrap px-3 py-3">
                  <span className="font-bold text-white">{row.symbol}</span>
                  <div className="mt-0.5 flex gap-1">
                    {row.bullishCandle && (
                      <span className="rounded bg-emerald-900/60 px-1 py-0.5 text-xs text-emerald-400">
                        Bullish
                      </span>
                    )}
                    {row.lowerLow && (
                      <span className="rounded bg-sky-900/60 px-1 py-0.5 text-xs text-sky-400">
                        Low&lt;Prev
                      </span>
                    )}
                  </div>
                </td>

                {/* Company */}
                <td className="max-w-[180px] truncate px-3 py-3 text-slate-300">
                  {row.company}
                </td>

                {/* Recent High */}
                <td className="px-3 py-3 text-right">
                  <RecentHighTooltip stock={row}>
                    <span className="font-medium text-slate-200 underline decoration-dotted decoration-slate-500">
                      ₹{fmt(row.recentHigh, 2)}
                    </span>
                  </RecentHighTooltip>
                </td>

                {/* Current Price */}
                <td className="px-3 py-3 text-right font-medium text-white">
                  ₹{fmt(row.currentPrice, 2)}
                </td>

                {/* % Drop */}
                <td className="px-3 py-3 text-right">
                  <span className="font-bold text-red-400">
                    {fmt(drop, 2)}%
                  </span>
                </td>

                {/* Today Volume */}
                <td className="px-3 py-3 text-right text-slate-300">
                  {fmtVol(row.todayVolume)}
                </td>

                {/* 5D Avg Volume */}
                <td className="px-3 py-3 text-right">
                  <VolumeTooltip stock={row}>
                    <span className="text-slate-400 underline decoration-dotted decoration-slate-600">
                      {fmtVol(row.avgVolume)}
                    </span>
                  </VolumeTooltip>
                </td>

                {/* Volume Ratio */}
                <td className="px-3 py-3 text-right">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-bold ${vrColor}`}
                  >
                    {fmt(vr, 2)}x
                  </span>
                </td>

                {/* Open */}
                <td className="px-3 py-3 text-right text-slate-400">
                  {fmt(row.todayOpen, 2)}
                </td>

                {/* High */}
                <td className="px-3 py-3 text-right text-slate-400">
                  {fmt(row.todayHigh, 2)}
                </td>

                {/* Low */}
                <td className="px-3 py-3 text-right text-slate-400">
                  {fmt(row.todayLow, 2)}
                </td>

                {/* Close */}
                <td className="px-3 py-3 text-right font-semibold text-white">
                  {fmt(row.todayClose, 2)}
                </td>

                {/* Close Position */}
                <td className={`px-3 py-3 text-right ${cpColor}`}>
                  {fmt(cp, 1)}%
                </td>

                {/* Score */}
                <td className="px-3 py-3 text-right">
                  <ScoreBadge score={row.score} />
                </td>

                {/* Signal */}
                <td className="px-3 py-3 text-center">
                  <SignalBadge signal={row.signal} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
