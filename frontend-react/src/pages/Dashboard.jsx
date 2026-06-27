import { useEffect, useState } from "react";

import { useScanner } from "../context/ScannerContext";

import DashboardSummary from "../components/DashboardSummary";
import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function Dashboard() {
  const {
    options,
    expiries,
    refreshScanner,
    setActiveTab,
  } = useScanner();

  const [filteredOptions, setFilteredOptions] = useState([]);

  /*
  ------------------------------------------
  Dashboard always uses "all" scanner mode
  ------------------------------------------
  */

  useEffect(() => {
    setActiveTab("all");
  }, [setActiveTab]);

  /*
  ------------------------------------------
  Refresh whenever active scanner changes
  ------------------------------------------
  */

  useEffect(() => {
    refreshScanner();
  }, [refreshScanner]);

  /*
  ------------------------------------------
  Update filtered list
  ------------------------------------------
  */

  useEffect(() => {
    setFilteredOptions(options);
  }, [options]);

  return (
    <div className="space-y-6">

      {/* ==========================================
          Dashboard Header
      ========================================== */}

      <div>

        <h1 className="text-3xl font-bold">
          📊 Dashboard
        </h1>

        <p className="mt-2 text-slate-400">
          Live Options Analytics Dashboard
        </p>

      </div>

      {/* ==========================================
          Dashboard Summary
      ========================================== */}

      <DashboardSummary />

      {/* ==========================================
          Market Overview
      ========================================== */}

      <MarketCards />

      {/* ==========================================
          Filters
      ========================================== */}

      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFilteredOptions}
        onRefresh={refreshScanner}
      />

      {/* ==========================================
          Scanner Table
      ========================================== */}

      <ScannerTable
        data={filteredOptions}
      />

    </div>
  );
}
