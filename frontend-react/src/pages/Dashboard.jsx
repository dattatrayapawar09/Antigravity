import MarketCards from "../components/MarketCards";
import ScannerTable from "../components/ScannerTable";

import { useScanner } from "../context/ScannerContext";

export default function Dashboard() {

  const { options } = useScanner();

  return (

    <div className="space-y-6">

      <MarketCards />

      <ScannerTable data={options} />

    </div>

  );

}
