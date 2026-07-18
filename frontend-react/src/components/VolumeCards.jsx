import { useMemo } from "react";
import { FiActivity, FiArrowUpRight, FiTrendingUp, FiAlertCircle } from "react-icons/fi";

export default function VolumeCards({ stocks = [], allStocksCount = 0 }) {
  const stats = useMemo(() => {
    const total = stocks.length;
    const highestRatio = total > 0 ? Math.max(...stocks.map((x) => x.volumeRatio ?? 0)) : 0;
    const avgRatio = total > 0 ? stocks.reduce((acc, x) => acc + (x.volumeRatio ?? 0), 0) / total : 0;

    const counts = {
      bullish: stocks.filter((x) => x.signal === "Bullish").length,
      bearish: stocks.filter((x) => x.signal === "Bearish").length,
      strongBullish: stocks.filter((x) => x.signal === "Strong Bullish").length,
      strongBearish: stocks.filter((x) => x.signal === "Strong Bearish").length,
    };

    return {
      total,
      highestRatio,
      avgRatio: avgRatio.toFixed(2),
      ...counts,
    };
  }, [stocks]);

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-8">
      {/* Stocks Scanned */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <FiActivity className="text-cyan-400" size={20} />
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Stocks Scanned</p>
            <h2 className="text-xl font-bold text-white mt-1">{allStocksCount}</h2>
          </div>
        </div>
      </div>

      {/* Top 50 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <FiTrendingUp className="text-cyan-400" size={20} />
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Top 50</p>
            <h2 className="text-xl font-bold text-white mt-1">{stats.total}</h2>
          </div>
        </div>
      </div>

      {/* Highest Volume Ratio */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <FiArrowUpRight className="text-green-400" size={20} />
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Highest Ratio</p>
            <h2 className="text-xl font-bold text-green-400 mt-1">{stats.highestRatio}x</h2>
          </div>
        </div>
      </div>

      {/* Average Volume Ratio */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-3">
        <div className="flex items-center gap-3">
          <FiArrowUpRight className="text-cyan-400" size={20} />
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Avg Volume Ratio</p>
            <h2 className="text-xl font-bold text-white mt-1">{stats.avgRatio}x</h2>
          </div>
        </div>
      </div>

      {/* Bullish */}
      <div className="rounded-xl border border-green-950/40 border-green-900/60 bg-green-950/20 p-4 xl:col-span-2">
        <p className="text-xs text-green-300 font-medium uppercase tracking-wider">Bullish</p>
        <h2 className="mt-1 text-xl font-bold text-green-400">{stats.bullish}</h2>
      </div>

      {/* Strong Bullish */}
      <div className="rounded-xl border border-emerald-950/40 border-emerald-900/60 bg-emerald-950/20 p-4 xl:col-span-2">
        <p className="text-xs text-emerald-300 font-medium uppercase tracking-wider">Strong Bullish</p>
        <h2 className="mt-1 text-xl font-bold text-emerald-400">{stats.strongBullish}</h2>
      </div>

      {/* Bearish */}
      <div className="rounded-xl border border-red-950/40 border-red-900/60 bg-red-950/20 p-4 xl:col-span-2">
        <p className="text-xs text-red-300 font-medium uppercase tracking-wider">Bearish</p>
        <h2 className="mt-1 text-xl font-bold text-red-400">{stats.bearish}</h2>
      </div>

      {/* Strong Bearish */}
      <div className="rounded-xl border border-rose-950/40 border-rose-900/60 bg-rose-950/20 p-4 xl:col-span-2">
        <p className="text-xs text-rose-300 font-medium uppercase tracking-wider">Strong Bearish</p>
        <h2 className="mt-1 text-xl font-bold text-rose-400">{stats.strongBearish}</h2>
      </div>
    </div>
  );
}
