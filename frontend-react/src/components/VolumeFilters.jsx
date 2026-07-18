import { useState, useEffect } from "react";
import { FiSearch, FiRotateCcw } from "react-icons/fi";

export default function VolumeFilters({
  stocks = [],
  onFilterChange,
}) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("ALL");
  const [volumeRatio, setVolumeRatio] = useState(1);
  const [signal, setSignal] = useState("ALL");
  const [priceChange, setPriceChange] = useState("ALL");

  // Dynamically obtain unique sectors from stocks list
  const sectors = ["ALL", ...new Set(stocks.map((x) => x.sector).filter(Boolean))].sort();

  useEffect(() => {
    let filtered = [...stocks];

    // Search
    if (search.trim()) {
      const keyword = search.trim().toLowerCase();
      filtered = filtered.filter((x) =>
        (x.symbol || "").toLowerCase().includes(keyword) ||
        (x.companyName || "").toLowerCase().includes(keyword)
      );
    }

    // Sector
    if (sector !== "ALL") {
      filtered = filtered.filter((x) => x.sector === sector);
    }

    // Volume Ratio
    filtered = filtered.filter(
      (x) => Number(x.volumeRatio ?? 0) >= Number(volumeRatio)
    );

    // Signal
    if (signal !== "ALL") {
      filtered = filtered.filter((x) => x.signal === signal);
    }

    // Price Change
    if (priceChange === "POSITIVE") {
      filtered = filtered.filter((x) => Number(x.changePercent ?? 0) > 0);
    } else if (priceChange === "NEGATIVE") {
      filtered = filtered.filter((x) => Number(x.changePercent ?? 0) < 0);
    }

    onFilterChange(filtered);
  }, [stocks, search, sector, volumeRatio, signal, priceChange, onFilterChange]);

  const resetFilters = () => {
    setSearch("");
    setSector("ALL");
    setVolumeRatio(1);
    setSignal("ALL");
    setPriceChange("ALL");
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {/* Search */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search Symbol / Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {/* Sector */}
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">All Sectors</option>
          {sectors.filter(s => s !== "ALL").map((sec) => (
            <option key={sec} value={sec}>
              {sec}
            </option>
          ))}
        </select>

        {/* Volume Ratio */}
        <select
          value={volumeRatio}
          onChange={(e) => setVolumeRatio(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value={1}>1x+ Volume Ratio</option>
          <option value={1.5}>1.5x+ Volume Ratio</option>
          <option value={2}>2x+ Volume Ratio</option>
          <option value={3}>3x+ Volume Ratio</option>
          <option value={5}>5x+ Volume Ratio</option>
        </select>

        {/* Signal */}
        <select
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">All Signals</option>
          <option value="Strong Bullish">Strong Bullish</option>
          <option value="Bullish">Bullish</option>
          <option value="Neutral">Neutral</option>
          <option value="Bearish">Bearish</option>
          <option value="Strong Bearish">Strong Bearish</option>
        </select>

        {/* Price Change */}
        <select
          value={priceChange}
          onChange={(e) => setPriceChange(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
        >
          <option value="ALL">All Price Changes</option>
          <option value="POSITIVE">Positive Change</option>
          <option value="NEGATIVE">Negative Change</option>
        </select>
      </div>

      {/* Reset Button */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={resetFilters}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
        >
          <FiRotateCcw />
          Reset Filters
        </button>
      </div>
    </div>
  );
}
