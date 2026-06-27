import { useScanner } from "../context/ScannerContext";

export default function Settings() {
  const {
    refreshInterval,
    setRefreshInterval,
    theme,
    setTheme,
  } = useScanner();

  return (
    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold">
          ⚙ Settings
        </h1>

        <p className="mt-1 text-slate-400">
          Customize your Options Pulse Tracker.
        </p>

      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

        <h2 className="mb-4 text-xl font-semibold">
          Auto Refresh
        </h2>

        <select
          value={refreshInterval}
          onChange={(e) =>
            setRefreshInterval(Number(e.target.value))
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
        >
          <option value={5}>5 Seconds</option>
          <option value={10}>10 Seconds</option>
          <option value={15}>15 Seconds</option>
          <option value={30}>30 Seconds</option>
          <option value={60}>1 Minute</option>
        </select>

      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

        <h2 className="mb-4 text-xl font-semibold">
          Theme
        </h2>

        <select
          value={theme}
          onChange={(e) =>
            setTheme(e.target.value)
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>

      </div>

    </div>
  );
}
