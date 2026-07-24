import { useState, useCallback } from "react";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import OptionTooltip from "./OptionTooltip";
import EmptyState from "./EmptyState";

/* ── Formatters ─────────────────────────────────────────────────────────────── */

const fmt = (v, d = 2) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "–";
  return Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

const fmtVol = (v) => {
  if (v === null || v === undefined) return "–";
  if (v >= 10_000_000) return (v / 10_000_000).toFixed(2) + " Cr";
  if (v >= 100_000)    return (v / 100_000).toFixed(2) + " Lk";
  if (v >= 1_000)      return (v / 1_000).toFixed(1) + "K";
  return String(v);
};

/* ── Signal badge ───────────────────────────────────────────────────────────── */

function SignalBadge({ signal }) {
  const map = {
    "Strong Bullish": "bg-emerald-950/80 text-emerald-300 border-emerald-800/60",
    "Bullish":        "bg-green-950/80 text-green-300 border-green-800/60",
    "Watch":          "bg-amber-950/80 text-amber-300 border-amber-800/60",
    "Ignore":         "bg-slate-800/80 text-slate-500 border-slate-700/60",
  };
  const cls = map[signal] ?? map.Ignore;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {signal}
    </span>
  );
}

/* ── Score badge ────────────────────────────────────────────────────────────── */

function ScoreBadge({ score }) {
  const n = Number(score ?? 0);
  const cls =
    n >= 90 ? "text-emerald-400 font-bold" :
    n >= 75 ? "text-green-400 font-bold"   :
    n >= 60 ? "text-amber-400 font-semibold" :
              "text-slate-400 font-semibold";
  return <span className={cls}>{fmt(n, 1)}</span>;
}

/* ── Option-type badge ──────────────────────────────────────────────────────── */

function TypeBadge({ type }) {
  const cls =
    type === "CE"
      ? "bg-emerald-900/60 text-emerald-300 border-emerald-800/50"
      : "bg-rose-900/60 text-rose-300 border-rose-800/50";
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-bold ${cls}`}>
      {type}
    </span>
  );
}

/* ── OI pattern badge ───────────────────────────────────────────────────────── */

function OIBadge({ pattern }) {
  const map = {
    "Long Build-up":  "text-emerald-400",
    "Short Covering": "text-green-400",
    "Short Build-up": "text-red-400",
    "Long Unwinding": "text-rose-400",
    "Neutral":        "text-slate-400",
  };
  return <span className={`text-xs font-semibold ${map[pattern] ?? "text-slate-400"}`}>{pattern}</span>;
}

/* ── Tooltip content builders ───────────────────────────────────────────────── */

function UnderlyingTooltipContent({ row }) {
  return (
    <div>
      <p className="mb-2 font-semibold text-slate-200">Underlying Reversal</p>
      <div className="space-y-1">
        {[
          ["Recent High",   `₹${fmt(row.recentHigh)}`],
          ["Current Price", `₹${fmt(row.currentPrice)}`],
          ["Price Drop",    <span key="drop" className="font-bold text-red-400">{fmt(row.priceDropPercent)}%</span>],
          ["Stock Vol Ratio", <span key="svr" className="font-bold text-green-400">{fmt(row.stockVolumeRatio)}x</span>],
          ["Close Position",  `${fmt(row.stockClosePosition, 1)}%`],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium text-white">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolumeTooltipContent({ row }) {
  const maxV = Math.max(...(row.optionVolumeHistory ?? [1]), 1);
  return (
    <div>
      <p className="mb-2 font-semibold text-slate-200">Option Volume</p>
      <div className="space-y-1">
        {[
          ["Today (lots)",    fmtVol(row.optionVolume)],
          ["Yesterday (lots)",fmtVol(row.yesterdayOptionVolume)],
          ["5D Avg (lots)",   <span key="avg" className="text-cyan-300 font-medium">{fmtVol(row.avgOptionVolume)}</span>],
          ["Vol Ratio",       <span key="vr" className="font-bold text-green-400">{fmt(row.volumeRatio)}x</span>],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium text-white">{val}</span>
          </div>
        ))}
      </div>
      {(row.optionVolumeHistory?.length ?? 0) > 0 && (
        <div className="mt-3 border-t border-slate-700 pt-2">
          <p className="mb-1 text-slate-500">Last sessions</p>
          <div className="flex items-end gap-0.5" style={{ height: 28 }}>
            {row.optionVolumeHistory.map((v, i) => {
              const h = Math.max(4, Math.round((v / maxV) * 28));
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-violet-600/70"
                  style={{ height: h }}
                  title={fmtVol(v)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OITooltipContent({ row }) {
  const patternColor = {
    "Long Build-up":  "text-emerald-400",
    "Short Covering": "text-green-400",
    "Short Build-up": "text-red-400",
    "Long Unwinding": "text-rose-400",
    "Neutral":        "text-slate-400",
  }[row.oiPattern] ?? "text-slate-400";

  return (
    <div>
      <p className="mb-2 font-semibold text-slate-200">Open Interest</p>
      <div className="space-y-1">
        {[
          ["Current OI",   fmtVol(row.oi)],
          ["Previous OI",  fmtVol(row.prevOI)],
          ["OI Change",    <span key="oic" className={row.oiChange >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{row.oiChange >= 0 ? "+" : ""}{fmt(row.oiChange)}%</span>],
          ["Pattern",      <span key="pat" className={`font-semibold ${patternColor}`}>{row.oiPattern}</span>],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium text-white">{val}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-700 pt-2 text-xs text-slate-500">
        CE: OI↑+Price↑ = Long Build-up<br />
        CE: OI↓+Price↑ = Short Covering<br />
        PE: OI↓+Price↓ = Short Covering
      </div>
    </div>
  );
}

/* ── Columns ────────────────────────────────────────────────────────────────── */

const COLUMNS = [
  { key: "rank",             label: "Rank",       align: "center" },
  { key: "symbol",           label: "Stock",      align: "left"   },
  { key: "sector",           label: "Sector",     align: "left"   },
  { key: "underlyingScore",  label: "Und. Score", align: "right"  },
  { key: "recentHigh",       label: "Rec. High",  align: "right"  },
  { key: "currentPrice",     label: "Price",      align: "right"  },
  { key: "priceDropPercent", label: "% Drop",     align: "right"  },
  { key: "strike",           label: "Strike",     align: "right"  },
  { key: "optionType",       label: "Type",       align: "center" },
  { key: "expiry",           label: "Expiry",     align: "center" },
  { key: "optionLTP",        label: "LTP",        align: "right"  },
  { key: "optionVolume",     label: "Volume",     align: "right"  },
  { key: "avgOptionVolume",  label: "5D Avg Vol", align: "right"  },
  { key: "volumeRatio",      label: "Vol Ratio",  align: "right"  },
  { key: "oi",               label: "OI",         align: "right"  },
  { key: "oiChange",         label: "OI Chg",     align: "right"  },
  { key: "spreadPct",        label: "Spread",     align: "right"  },
  { key: "smartScore",       label: "Score",      align: "right"  },
  { key: "signal",           label: "Signal",     align: "center" },
];

/* ── Main table ─────────────────────────────────────────────────────────────── */

export default function SmartReversalOptionTable({ data = [] }) {
  const [sortField, setSortField] = useState("smartScore");
  const [sortDir,   setSortDir  ] = useState("desc");

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }, [sortField]);

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
    return sortDir === "asc"
      ? <FiChevronUp className="ml-0.5 inline" size={11} />
      : <FiChevronDown className="ml-0.5 inline" size={11} />;
  };

  if (!sorted.length) {
    return (
      <EmptyState
        title="No Option Setups Found"
        message="No F&O option contracts match the Smart Reversal criteria. Try relaxing filters or checking data availability."
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
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-3 text-${col.align} text-xs font-semibold uppercase tracking-wider transition hover:text-white`}
              >
                {col.label}
                <SortIcon field={col.key} />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row, i) => {
            const vr        = Number(row.volumeRatio ?? 0);
            const oiChg     = Number(row.oiChange    ?? 0);
            const undScore  = Number(row.underlyingScore ?? 0);

            const vrCls =
              vr >= 3 ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/40" :
              vr >= 2 ? "bg-green-950/50 text-green-300 border-green-800/40"       :
                        "bg-amber-950/50 text-amber-300 border-amber-800/40";

            const undScoreCls =
              undScore >= 85 ? "text-emerald-400 font-bold" :
              undScore >= 75 ? "text-green-400 font-bold"   :
                               "text-amber-400 font-semibold";

            return (
              <tr
                key={`${row.symbol}-${row.strike}-${row.optionType}-${row.expiry}-${i}`}
                className="border-b border-slate-800 transition-colors hover:bg-slate-800/50"
              >
                {/* Rank */}
                <td className="px-3 py-3 text-center text-slate-500 font-semibold">
                  {row.rank || i + 1}
                </td>

                {/* Stock + sub-tags */}
                <td className="whitespace-nowrap px-3 py-3">
                  <span className="font-bold text-white">{row.symbol}</span>
                  <div className="mt-0.5 text-xs text-slate-500 truncate max-w-[100px]">
                    {row.company}
                  </div>
                </td>

                {/* Sector */}
                <td className="max-w-[120px] truncate px-3 py-3 text-slate-400 text-xs">
                  {row.sector}
                </td>

                {/* Underlying Score (with tooltip) */}
                <td className="px-3 py-3 text-right">
                  <OptionTooltip
                    content={<UnderlyingTooltipContent row={row} />}
                    width="w-64"
                  >
                    <span className={`cursor-help underline decoration-dotted decoration-slate-600 ${undScoreCls}`}>
                      {fmt(undScore, 1)}
                    </span>
                  </OptionTooltip>
                </td>

                {/* Recent High */}
                <td className="px-3 py-3 text-right font-medium text-slate-300">
                  ₹{fmt(row.recentHigh)}
                </td>

                {/* Current Price */}
                <td className="px-3 py-3 text-right font-semibold text-white">
                  ₹{fmt(row.currentPrice)}
                </td>

                {/* % Drop */}
                <td className="px-3 py-3 text-right font-bold text-red-400">
                  {fmt(row.priceDropPercent)}%
                </td>

                {/* Strike */}
                <td className="px-3 py-3 text-right font-semibold text-slate-200">
                  {fmt(row.strike, 0)}
                </td>

                {/* Option Type badge */}
                <td className="px-3 py-3 text-center">
                  <TypeBadge type={row.optionType} />
                </td>

                {/* Expiry */}
                <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-400">
                  {row.expiry}
                </td>

                {/* LTP */}
                <td className="px-3 py-3 text-right font-bold text-white">
                  ₹{fmt(row.optionLTP)}
                </td>

                {/* Option Volume */}
                <td className="px-3 py-3 text-right text-slate-300">
                  {fmtVol(row.optionVolume)}
                </td>

                {/* 5D Avg Vol (with tooltip) */}
                <td className="px-3 py-3 text-right">
                  <OptionTooltip
                    content={<VolumeTooltipContent row={row} />}
                    width="w-56"
                  >
                    <span className="cursor-help text-slate-400 underline decoration-dotted decoration-slate-600">
                      {fmtVol(row.avgOptionVolume)}
                    </span>
                  </OptionTooltip>
                </td>

                {/* Vol Ratio */}
                <td className="px-3 py-3 text-right">
                  <span className={`rounded border px-2 py-0.5 text-xs font-bold ${vrCls}`}>
                    {fmt(vr)}x
                  </span>
                </td>

                {/* OI */}
                <td className="px-3 py-3 text-right text-slate-300">
                  {fmtVol(row.oi)}
                </td>

                {/* OI Change (with tooltip) */}
                <td className="px-3 py-3 text-right">
                  <OptionTooltip
                    content={<OITooltipContent row={row} />}
                    width="w-64"
                  >
                    <span className="cursor-help">
                      <span className={oiChg >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {oiChg >= 0 ? "+" : ""}{fmt(oiChg)}%
                      </span>
                      <br />
                      <OIBadge pattern={row.oiPattern} />
                    </span>
                  </OptionTooltip>
                </td>

                {/* Spread % */}
                <td className="px-3 py-3 text-right">
                  <span className={row.spreadPct <= 1 ? "text-green-400" : row.spreadPct <= 2 ? "text-amber-400" : "text-red-400"}>
                    {fmt(row.spreadPct)}%
                  </span>
                </td>

                {/* Smart Score */}
                <td className="px-3 py-3 text-right">
                  <ScoreBadge score={row.smartScore} />
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
