import { FiActivity, FiClock, FiDatabase, FiWifi } from "react-icons/fi";
import { useScanner } from "../context/ScannerContext";

export default function StatusBar() {
  const {
    options,
    marketMode,
    loading,
  } = useScanner();

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 px-6 py-3">

      <div className="flex flex-wrap items-center justify-between gap-4">

        {/* Backend */}

        <div className="flex items-center gap-2">

          <FiWifi className="text-green-400" />

          <span className="text-slate-400">

            Backend

          </span>

          <span className="font-semibold text-green-400">

            Connected

          </span>

        </div>

        {/* Scanner */}

        <div className="flex items-center gap-2">

          <FiActivity className="text-cyan-400" />

          <span className="text-slate-400">

            Scanner

          </span>

          <span className="font-semibold">

            {marketMode}

          </span>

        </div>

        {/* Contracts */}

        <div className="flex items-center gap-2">

          <FiDatabase className="text-yellow-400" />

          <span className="text-slate-400">

            Contracts

          </span>

          <span className="font-semibold">

            {options.length}

          </span>

        </div>

        {/* Refresh */}

        <div className="flex items-center gap-2">

          <FiClock className="text-green-400" />

          <span className="text-slate-400">

            Status

          </span>

          <span
            className={
              loading
                ? "text-yellow-400"
                : "text-green-400"
            }
          >
            {loading ? "Refreshing..." : "Live"}
          </span>

        </div>

      </div>

    </div>
  );
}
