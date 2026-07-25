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
  const opt = row.recommendedOption || {};
  return (
    <div>
      <p className="mb-2 font-semibold text-slate-200">Option Volume</p>
      <div className="space-y-1">
        {[
          ["Today (lots)",    fmtVol(opt.volume)],
          ["5D Avg (lots)",   <span key="avg" className="text-cyan-300 font-medium">{fmtVol(opt.avgVolume)}</span>],
          ["Vol Ratio",       <span key="vr" className="font-bold text-green-400">{fmt(opt.volumeRatio)}x</span>],
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

function OITooltipContent({ row }) {
  const opt = row.recommendedOption || {};
  return (
    <div>
      <p className="mb-2 font-semibold text-slate-200">Open Interest</p>
      <div className="space-y-1">
        {[
          ["Current OI",   fmtVol(opt.oi)],
          ["OI Change",    <span key="oic" className={opt.oiChange >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{opt.oiChange >= 0 ? "+" : ""}{fmt(opt.oiChange)}%</span>],
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

/* ── Columns ────────────────────────────────────────────────────────────────── */

const COLUMNS = [
  { key: "rank",             label: "Rank",       align: "center" },
  { key: "symbol",           label: "Stock",      align: "left"   },
  { key: "currentPrice",     label: "Price",      align: "right"  },
  { key: "priceDropPercent", label: "% Drop",     align: "right"  },
  { key: "strike",           label: "Rec. Option",align: "center" },
  { key: "expiry",           label: "Expiry",     align: "center" },
  { key: "optionLTP",        label: "LTP",        align: "right"  },
  { key: "volumeRatio",      label: "Vol Ratio",  align: "right"  },
  { key: "oiChange",         label: "OI Chg",     align: "right"  },
  { key: "underlyingScore",  label: "Und. Score", align: "right"  },
  { key: "smartScore",       label: "Opt. Score", align: "right"  },
  { key: "finalScore",       label: "Final Score",align: "right"  },
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
            const opt       = row.recommendedOption || {};
            const vr        = Number(opt.volumeRatio ?? 0);
            const oiChg     = Number(opt.oiChange    ?? 0);
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
                key={`${row.symbol}-${opt.strike}-${opt.type}-${opt.expiry}-${i}`}
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

                {/* Current Price */}
                <td className="px-3 py-3 text-right font-semibold text-white">
                  ₹{fmt(row.currentPrice)}
                </td>

                {/* % Drop */}
                <td className="px-3 py-3 text-right font-bold text-red-400">
                  {fmt(row.priceDropPercent)}%
                </td>

                {/* Rec. Option */}
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="font-semibold text-slate-200">{fmt(opt.strike, 0)}</span>
                    <TypeBadge type={opt.type} />
                  </div>
                </td>

                {/* Expiry */}
                <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-400">
                  {opt.expiry}
                </td>

                {/* LTP */}
                <td className="px-3 py-3 text-right font-bold text-white">
                  ₹{fmt(opt.ltp)}
                </td>

                {/* Vol Ratio (with tooltip) */}
                <td className="px-3 py-3 text-right">
                  <OptionTooltip
                    content={<VolumeTooltipContent row={row} />}
                    width="w-56"
                  >
                    <span className={`cursor-help rounded border px-2 py-0.5 text-xs font-bold underline decoration-dotted decoration-slate-600 ${vrCls}`}>
                      {fmt(vr)}x
                    </span>
                  </OptionTooltip>
                </td>

                {/* OI Change (with tooltip) */}
                <td className="px-3 py-3 text-right">
                  <OptionTooltip
                    content={<OITooltipContent row={row} />}
                    width="w-64"
                  >
                    <span className="cursor-help underline decoration-dotted decoration-slate-600">
                      <span className={oiChg >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                        {oiChg >= 0 ? "+" : ""}{fmt(oiChg)}%
                      </span>
                    </span>
                  </OptionTooltip>
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

                {/* Smart Score */}
                <td className="px-3 py-3 text-right">
                  <ScoreBadge score={opt.score} />
                </td>

                {/* Final Score */}
                <td className="px-3 py-3 text-right text-lg">
                  <ScoreBadge score={row.finalScore} />
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
