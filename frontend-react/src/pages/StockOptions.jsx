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
    setActiveTab,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  useEffect(() => {
    setActiveTab("stocks");
  }, [setActiveTab]);

  useEffect(() => {
    setFilteredOptions(options);
  }, [options]);

  return (
    <div className="space-y-6">

      {/* Page Header */}

      <div>

        <h1 className="text-3xl font-bold">
          🏢 Stock Options
        </h1>

        <p className="mt-1 text-slate-400">
          Top 50 F&O Stocks • Monthly Expiry • Ranked by Smart Score
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
      />

      {/* Scanner Table */}

      <ScannerTable
        data={filteredOptions}
      />

    </div>
  );
}
