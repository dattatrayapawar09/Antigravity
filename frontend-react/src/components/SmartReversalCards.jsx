import { useMemo } from "react";
import {
  FiActivity,
  FiZap,
  FiTrendingUp,
  FiBarChart2,
  FiStar,
  FiEye,
} from "react-icons/fi";

const CARD_DEFS = [
  {
    key: "scanned",
    label: "Stocks Scanned",
    icon: FiActivity,
    iconColor: "text-cyan-400",
    valueColor: "text-white",
    border: "border-slate-700",
    bg: "bg-slate-900",
    span: 2,
  },
  {
    key: "strongReversal",
    label: "Strong Reversal",
    icon: FiZap,
    iconColor: "text-emerald-400",
    valueColor: "text-emerald-400",
    border: "border-emerald-900/60",
    bg: "bg-emerald-950/20",
    span: 2,
  },
  {
    key: "reversal",
    label: "Reversal",
    icon: FiTrendingUp,
    iconColor: "text-green-400",
    valueColor: "text-green-400",
    border: "border-green-900/60",
    bg: "bg-green-950/20",
    span: 2,
  },
  {
    key: "watch",
    label: "Watch",
    icon: FiEye,
    iconColor: "text-amber-400",
    valueColor: "text-amber-400",
    border: "border-amber-900/60",
    bg: "bg-amber-950/20",
    span: 2,
  },
  {
    key: "avgVolumeRatio",
    label: "Avg Volume Ratio",
    icon: FiBarChart2,
    iconColor: "text-sky-400",
    valueColor: "text-white",
    border: "border-slate-700",
    bg: "bg-slate-900",
    format: (v) => `${v}x`,
    span: 2,
  },
  {
    key: "highestScore",
    label: "Highest Score",
    icon: FiStar,
    iconColor: "text-yellow-400",
    valueColor: "text-yellow-400",
    border: "border-yellow-900/60",
    bg: "bg-yellow-950/20",
    span: 2,
  },
];

export default function SmartReversalCards({ stocks = [], allScanned = 0 }) {
  const stats = useMemo(() => {
    const n = stocks.length;
    const avgVR =
      n > 0
        ? (stocks.reduce((s, x) => s + (x.volumeRatio ?? 0), 0) / n).toFixed(2)
        : "0.00";
    const highest =
      n > 0 ? Math.max(...stocks.map((x) => x.score ?? 0)).toFixed(1) : "0";

    return {
      scanned: allScanned,
      strongReversal: stocks.filter((x) => x.signal === "Strong Reversal").length,
      reversal: stocks.filter((x) => x.signal === "Reversal").length,
      watch: stocks.filter((x) => x.signal === "Watch").length,
      avgVolumeRatio: avgVR,
      highestScore: highest,
    };
  }, [stocks, allScanned]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
      {CARD_DEFS.map((card) => {
        const Icon = card.icon;
        const raw = stats[card.key];
        const display = card.format ? card.format(raw) : raw;
        return (
          <div
            key={card.key}
            className={`rounded-xl border p-4 ${card.border} ${card.bg} col-span-1`}
          >
            <div className="flex items-center gap-3">
              <Icon className={card.iconColor} size={20} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {card.label}
                </p>
                <h2 className={`mt-1 text-2xl font-bold ${card.valueColor}`}>
                  {display}
                </h2>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
