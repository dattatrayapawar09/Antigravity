import { useEffect, useState } from "react";

import { useScanner } from "../context/ScannerContext";

import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function StockOptions() {
  const {
    options,
    expiries,
    refreshScanner,
    loading,
    setActiveTab,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  // Set tab when this page mounts. ScannerContext will
  // automatically fetch stocks data when activeTab changes.
  useEffect(() => {
    setActiveTab("stocks");
  }, [setActiveTab]);

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">
          🏢 Stock Options
        </h1>
        <p className="mt-1 text-slate-400">
          Top 50 F&amp;O Stocks • Monthly Expiry • Ranked by Smart Score
        </p>
      </div>

      {/* Market Cards */}
      <MarketCards />

      {/* Filters — controls filteredOptions via onFilterChange */}
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
