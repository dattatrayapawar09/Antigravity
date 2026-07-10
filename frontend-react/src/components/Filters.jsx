import { useState, useEffect } from "react";
import {
  FiRefreshCw,
  FiSearch,
  FiRotateCcw,
} from "react-icons/fi";

export default function Filters({
  options = [],
  expiries = [],
  onFilterChange,
  onRefresh,
  loading = false,
}) {
  const [search, setSearch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [optionType, setOptionType] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [signal, setSignal] = useState("ALL");
  const [volumeRatio, setVolumeRatio] = useState(1.5);
  const [oiChange, setOiChange] = useState(0);

  useEffect(() => {
    let filtered = [...options];

    // -------------------------------
    // Search
    // -------------------------------
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();

      filtered = filtered.filter((x) =>
        (
          `${x.symbol ?? ""} ${x.underlying ?? ""}`
        )
          .toLowerCase()
          .includes(keyword)
      );
    }

    // -------------------------------
    // Expiry
    // -------------------------------
    if (expiry) {
      filtered = filtered.filter(
        (x) =>
          String(x.expiry).toUpperCase() ===
          String(expiry).toUpperCase()
      );
    }

    // -------------------------------
    // CE / PE
    // -------------------------------
    if (optionType !== "ALL") {
      filtered = filtered.filter(
        (x) => x.type === optionType
      );
    }

    // -------------------------------
    // Category
    // -------------------------------
    if (category !== "ALL") {
      filtered = filtered.filter(
        (x) => x.category === category
      );
    }

    // -------------------------------
    // Volume Ratio
    // -------------------------------
    filtered = filtered.filter(
      (x) =>
        Number(x.volumeRatio ?? 0) >=
        Number(volumeRatio)
    );

    // -------------------------------
    // OI Change %
    // -------------------------------
    if (oiChange > 0) {
      filtered = filtered.filter(
        (x) =>
          Math.abs(
            Number(
              x.oiChangePercent ??
                x.oiChgPct ??
                0
            )
          ) >= oiChange
      );
    }

    // -------------------------------
    // Signal
    // -------------------------------
    if (signal !== "ALL") {
      filtered = filtered.filter(
        (x) => x.signal === signal
      );
    }

    onFilterChange(filtered);

  }, [
    options,
    search,
    expiry,
    optionType,
    category,
    signal,
    volumeRatio,
    oiChange,
    onFilterChange,
  ]);

  const resetFilters = () => {
    setSearch("");
    setExpiry("");
    setOptionType("ALL");
    setCategory("ALL");
    setSignal("ALL");
    setVolumeRatio(1.5);
    setOiChange(0);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-8">

        {/* Search */}

        <div className="relative xl:col-span-2">

          <FiSearch
            className="absolute left-3 top-3 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search Symbol..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-white focus:border-cyan-500 focus:outline-none"
          />

        </div>

        {/* Expiry */}

        <select
          value={expiry}
          onChange={(e) =>
            setExpiry(e.target.value)
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="">
            All Expiry
          </option>

          {expiries.map((exp) => (
            <option
              key={exp}
              value={exp}
            >
              {exp}
            </option>
          ))}
        </select>

        {/* Option Type */}

        <select
          value={optionType}
          onChange={(e) =>
            setOptionType(e.target.value)
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">ALL</option>
          <option value="CE">CE</option>
          <option value="PE">PE</option>
        </select>

        {/* Category */}

        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value)
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">ALL</option>
          <option value="Index">Index</option>
          <option value="Stock">Stock</option>
        </select>

        {/* Volume Ratio */}

        <select
          value={volumeRatio}
          onChange={(e) =>
            setVolumeRatio(Number(e.target.value))
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value={1}>1x+</option>
          <option value={1.5}>1.5x+</option>
          <option value={2}>2x+</option>
          <option value={3}>3x+</option>
          <option value={5}>5x+</option>
        </select>

        {/* OI Change */}

        <select
          value={oiChange}
          onChange={(e) =>
            setOiChange(Number(e.target.value))
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value={0}>All OI</option>
          <option value={5}>±5%</option>
          <option value={10}>±10%</option>
          <option value={20}>±20%</option>
          <option value={30}>±30%</option>
          <option value={50}>±50%</option>
        </select>

        {/* Signal */}

        <select
          value={signal}
          onChange={(e) =>
            setSignal(e.target.value)
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">All Signals</option>
          <option value="BUY">BUY</option>
          <option value="STRONG BUY">STRONG BUY</option>
          <option value="SELL">SELL</option>
          <option value="STRONG SELL">STRONG SELL</option>
          <option value="NEUTRAL">NEUTRAL</option>
        </select>

      </div>

      {/* Action Buttons */}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">

        <button
          onClick={resetFilters}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800"
        >
          <FiRotateCcw />

          Reset

        </button>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiRefreshCw
            className={loading ? "animate-spin" : ""}
          />

          {loading ? "Refreshing..." : "Refresh"}

        </button>

      </div>

    </div>

  );

}