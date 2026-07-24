import { useMemo } from "react";
import {
  FiActivity,
  FiLayers,
  FiZap,
  FiTrendingUp,
  FiEye,
  FiBarChart2,
  FiStar,
} from "react-icons/fi";

const CARDS = [
  {
    key: "stocksQualified",
    label: "Stocks Qualified",
    icon: FiActivity,
    iconColor: "text-cyan-400",
    textColor: "text-white",
    border: "border-slate-700",
    bg: "bg-slate-900",
  },
  {
    key: "optionsScanned",
    label: "Options Scanned",
    icon: FiLayers,
    iconColor: "text-sky-400",
    textColor: "text-sky-300",
    border: "border-sky-900/50",
    bg: "bg-sky-950/20",
  },
  {
    key: "strongBullish",
    label: "Strong Bullish",
    icon: FiZap,
    iconColor: "text-emerald-400",
    textColor: "text-emerald-400",
    border: "border-emerald-900/60",
    bg: "bg-emerald-950/20",
  },
  {
    key: "bullish",
    label: "Bullish",
    icon: FiTrendingUp,
    iconColor: "text-green-400",
    textColor: "text-green-400",
    border: "border-green-900/60",
    bg: "bg-green-950/20",
  },
  {
    key: "watch",
    label: "Watch",
    icon: FiEye,
    iconColor: "text-amber-400",
    textColor: "text-amber-400",
    border: "border-amber-900/60",
    bg: "bg-amber-950/20",
  },
  {
    key: "avgVolumeRatio",
    label: "Avg Vol Ratio",
    icon: FiBarChart2,
    iconColor: "text-violet-400",
    textColor: "text-white",
    border: "border-slate-700",
    bg: "bg-slate-900",
    format: (v) => `${v}x`,
  },
  {
    key: "highestScore",
    label: "Highest Score",
    icon: FiStar,
    iconColor: "text-yellow-400",
    textColor: "text-yellow-400",
    border: "border-yellow-900/60",
    bg: "bg-yellow-950/20",
  },
];

export default function SmartReversalOptionCards({
  contracts = [],
  stocksQualified = 0,
  optionsScanned = 0,
}) {
  const stats = useMemo(() => {
    const n = contracts.length;
    const avgVR =
      n > 0
        ? (contracts.reduce((s, x) => s + (x.volumeRatio ?? 0), 0) / n).toFixed(2)
        : "0.00";
    const highest =
      n > 0 ? Math.max(...contracts.map((x) => x.smartScore ?? 0)).toFixed(1) : "0";

    return {
      stocksQualified,
      optionsScanned,
      strongBullish: contracts.filter((x) => x.signal === "Strong Bullish").length,
      bullish:       contracts.filter((x) => x.signal === "Bullish").length,
      watch:         contracts.filter((x) => x.signal === "Watch").length,
      avgVolumeRatio: avgVR,
      highestScore:   highest,
    };
  }, [contracts, stocksQualified, optionsScanned]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const raw  = stats[card.key];
        const val  = card.format ? card.format(raw) : raw;
        return (
          <div
            key={card.key}
            className={`rounded-xl border p-4 ${card.border} ${card.bg}`}
          >
            <div className="flex items-center gap-3">
              <Icon className={card.iconColor} size={20} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {card.label}
                </p>
                <h2 className={`mt-1 text-2xl font-bold ${card.textColor}`}>{val}</h2>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
