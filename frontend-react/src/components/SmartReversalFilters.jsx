import { useState, useEffect, useCallback } from "react";
import { FiSearch, FiRotateCcw } from "react-icons/fi";

const LOOKBACK_OPTIONS = [10, 20, 30, 50];
const DROP_OPTIONS     = [5, 7, 10, 15, 20];
const VRATIO_OPTIONS   = [1.5, 2, 3, 5];
const SIGNAL_OPTIONS   = ["All", "Strong Reversal", "Reversal", "Watch", "Weak"];
const SORT_OPTIONS     = [
  { value: "score",           label: "Score" },
  { value: "priceDropPercent",label: "Price Drop %" },
  { value: "volumeRatio",     label: "Volume Ratio" },
  { value: "closePosition",   label: "Close Position" },
];

const DEFAULT_FILTERS = {
  lookbackDays:   20,
  minPriceDrop:   10,
  minVolumeRatio: 2,
  closePosition:  70,
  signal:         "All",
  sector:         "All",
  search:         "",
  sortBy:         "score",
};

export default function SmartReversalFilters({
  stocks = [],
  onFilterChange,
  onParamChange,   // called when server-side params change
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Dynamic sector list from live data
  const sectors = [
    "All",
    ...Array.from(new Set(stocks.map((x) => x.sector).filter(Boolean))).sort(),
  ];

  // Notify parent of server-side param changes (lookback, minDrop, VRatio, closePos)
  useEffect(() => {
    if (onParamChange) {
      onParamChange({
        lookbackDays:   filters.lookbackDays,
        minPriceDrop:   filters.minPriceDrop,
        minVolumeRatio: filters.minVolumeRatio,
        closePosition:  filters.closePosition,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.lookbackDays,
    filters.minPriceDrop,
    filters.minVolumeRatio,
    filters.closePosition,
  ]);

  // Client-side filtering (signal, sector, search, sort)
  useEffect(() => {
    let filtered = [...stocks];

    if (filters.search.trim()) {
      const kw = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (x) =>
          (x.symbol ?? "").toLowerCase().includes(kw) ||
          (x.company ?? "").toLowerCase().includes(kw)
      );
    }

    if (filters.signal !== "All") {
      filtered = filtered.filter((x) => x.signal === filters.signal);
    }

    if (filters.sector !== "All") {
      filtered = filtered.filter((x) => x.sector === filters.sector);
    }

    // Sort
    filtered.sort((a, b) => {
      const av = a[filters.sortBy] ?? 0;
      const bv = b[filters.sortBy] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        // price drop is negative — "more negative" should rank first for priceDropPercent
        if (filters.sortBy === "priceDropPercent") return av - bv;
        return bv - av;
      }
      return String(bv).localeCompare(String(av));
    });

    onFilterChange(filtered);
  }, [stocks, filters, onFilterChange]);

  const set = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = () => setFilters(DEFAULT_FILTERS);

  const selectCls =
    "rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white focus:border-cyan-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">

        {/* Search */}
        <div className="relative xl:col-span-2">
          <FiSearch className="absolute left-3 top-3 text-slate-400" size={14} />
          <input
            id="sr-search"
            type="text"
            placeholder="Search symbol / company…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {/* Lookback Days */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Lookback Days</label>
          <select
            id="sr-lookback"
            value={filters.lookbackDays}
            onChange={(e) => set("lookbackDays", Number(e.target.value))}
            className={selectCls}
          >
            {LOOKBACK_OPTIONS.map((v) => (
              <option key={v} value={v}>{v} Days</option>
            ))}
          </select>
        </div>

        {/* Min Price Drop */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Min Price Drop</label>
          <select
            id="sr-drop"
            value={filters.minPriceDrop}
            onChange={(e) => set("minPriceDrop", Number(e.target.value))}
            className={selectCls}
          >
            {DROP_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}%+</option>
            ))}
          </select>
        </div>

        {/* Volume Ratio */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Volume Ratio</label>
          <select
            id="sr-vratio"
            value={filters.minVolumeRatio}
            onChange={(e) => set("minVolumeRatio", Number(e.target.value))}
            className={selectCls}
          >
            {VRATIO_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}x+</option>
            ))}
          </select>
        </div>

        {/* Signal */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Signal</label>
          <select
            id="sr-signal"
            value={filters.signal}
            onChange={(e) => set("signal", e.target.value)}
            className={selectCls}
          >
            {SIGNAL_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Sort By</label>
          <select
            id="sr-sort"
            value={filters.sortBy}
            onChange={(e) => set("sortBy", e.target.value)}
            className={selectCls}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Sector */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Sector</label>
          <select
            id="sr-sector"
            value={filters.sector}
            onChange={(e) => set("sector", e.target.value)}
            className={selectCls}
          >
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto mt-4">
          <button
            id="sr-reset"
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <FiRotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
