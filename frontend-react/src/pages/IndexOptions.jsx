import { useEffect, useState } from "react";

import { useScanner } from "../context/ScannerContext";

import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function IndexOptions() {
  const {
    options,
    expiries,
    refreshScanner,
    loading,
    setActiveTab,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  useEffect(() => {
    setActiveTab("index");
  }, [setActiveTab]);

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold">
          📈 Index Options
        </h1>
        <p className="mt-1 text-slate-400">
          Current Weekly Expiry • Ranked by Smart Score
        </p>
      </div>

      <MarketCards />

      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFilteredOptions}
        onRefresh={refreshScanner}
        loading={loading}
      />

      <ScannerTable data={filteredOptions} />

    </div>
  );
}
