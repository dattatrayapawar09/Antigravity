import { useState } from "react";

import { useScanner } from "../context/ScannerContext";

import MarketCards from "../components/MarketCards";
import Filters from "../components/Filters";
import ScannerTable from "../components/ScannerTable";

export default function Dashboard() {

  const {
    options,
    expiries,
    refreshScanner,
  } = useScanner();

  const [filtered, setFiltered] =
    useState(options);

  return (

    <div className="space-y-6">

      <MarketCards />

      <Filters
        options={options}
        expiries={expiries}
        onFilterChange={setFiltered}
        onRefresh={refreshScanner}
      />

      <ScannerTable
        data={filtered}
      />

    </div>

  );

}
