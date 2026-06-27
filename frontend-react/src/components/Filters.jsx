import { useState, useMemo } from "react";
import {
  FiRefreshCw,
  FiSearch,
} from "react-icons/fi";

export default function Filters({
  options = [],
  expiries = [],
  onFilterChange,
  onRefresh,
}) {
  const [search, setSearch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [optionType, setOptionType] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [volumeRatio, setVolumeRatio] = useState(1.5);

  useMemo(() => {
    let filtered = [...options];

    // Search
    if (search) {
      filtered = filtered.filter((x) =>
        x.symbol.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Expiry
    if (expiry) {
      filtered = filtered.filter(
        (x) => x.expiry === expiry
      );
    }

    // CE / PE
    if (optionType !== "ALL") {
      filtered = filtered.filter(
        (x) => x.type === optionType
      );
    }

    // Category
    if (category !== "ALL") {
      filtered = filtered.filter(
        (x) => x.category === category
      );
    }

    // Volume Ratio
    filtered = filtered.filter(
      (x) => x.volumeRatio >= volumeRatio
    );

    onFilterChange(filtered);

  }, [
    options,
    search,
    expiry,
    optionType,
    category,
    volumeRatio,
    onFilterChange,
  ]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">

        {/* Search */}

        <div className="relative">

          <FiSearch
            className="absolute left-3 top-3 text-slate-400"
          />

          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-10 pr-3 py-2"
            placeholder="Search Symbol"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

        </div>

        {/* Expiry */}

        <select
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
          value={expiry}
          onChange={(e) =>
            setExpiry(e.target.value)
          }
        >
          <option value="">All Expiry</option>

          {expiries.map((exp) => (
            <option key={exp}>
              {exp}
            </option>
          ))}
        </select>

        {/* CE PE */}

        <select
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
          value={optionType}
          onChange={(e) =>
            setOptionType(e.target.value)
          }
        >
          <option>ALL</option>
          <option>CE</option>
          <option>PE</option>
        </select>

        {/* Category */}

        <select
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
          value={category}
          onChange={(e) =>
            setCategory(e.target.value)
          }
        >
          <option>ALL</option>
          <option>Index</option>
          <option>Stock</option>
        </select>

        {/* Volume Ratio */}

        <select
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
          value={volumeRatio}
          onChange={(e) =>
            setVolumeRatio(Number(e.target.value))
          }
        >
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
          <option value={3}>3x</option>
          <option value={5}>5x</option>
        </select>

        {/* Refresh */}

        <button
          onClick={onRefresh}
          className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 hover:bg-cyan-700"
        >
          <FiRefreshCw />

          Refresh
        </button>

      </div>

    </div>
  );
}
