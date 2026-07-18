import { useEffect, useState } from "react";

import { useScanner } from "../context/ScannerContext";

import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function AllScanner() {
  const {
    options,
    expiries,
    refreshScanner,
    loading,
    setActiveTab,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  useEffect(() => {
    setActiveTab("all");
  }, [setActiveTab]);

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">
          🌐 All Scanner
        </h1>
        <p className="mt-1 text-slate-400">
          Top 50 Options Across Index &amp; Stocks • Ranked by Smart Score
        </p>
      </div>

      {/* Market Cards */}
      <MarketCards />

      {/* Filters */}
      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFilteredOptions}
        onRefresh={refreshScanner}
        loading={loading}
      />

      {/* Scanner Table */}
      <ScannerTable data={filteredOptions} />

    </div>
  );
}
