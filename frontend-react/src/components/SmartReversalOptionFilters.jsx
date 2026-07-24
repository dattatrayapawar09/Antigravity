import { useState, useEffect, useCallback } from "react";
import { FiSearch, FiRotateCcw } from "react-icons/fi";

/* ── filter option definitions ─────────────────────────────────────────────── */

const LOOKBACK_OPTS    = [10, 20, 30, 50];
const DROP_OPTS        = [5, 7, 10, 15];
const STOCK_VR_OPTS    = [1.5, 2, 3];
const OPT_VR_OPTS      = [1.5, 2, 3, 5];
const STRIKE_OPTS      = [
  { value: 0, label: "ATM Only" },
  { value: 1, label: "ATM ±1"   },
  { value: 2, label: "ATM ±2"   },
  { value: 5, label: "ATM ±5"   },
];
const EXPIRY_OPTS      = [
  { value: "both",    label: "Both"    },
  { value: "current", label: "Current" },
  { value: "next",    label: "Next"    },
];
const OPT_TYPE_OPTS    = [
  { value: "both", label: "CE + PE" },
  { value: "CE",   label: "CE Only" },
  { value: "PE",   label: "PE Only" },
];
const SIGNAL_OPTS      = ["All", "Strong Bullish", "Bullish", "Watch"];
const SPREAD_OPTS      = [
  { value: 1.0, label: "1%" },
  { value: 2.0, label: "2%" },
  { value: 3.0, label: "3%" },
  { value: 5.0, label: "5%" },
];
const SORT_OPTS        = [
  { value: "smartScore",      label: "Smart Score"    },
  { value: "volumeRatio",     label: "Vol Ratio"      },
  { value: "oiChange",        label: "OI Change"      },
  { value: "priceDropPercent",label: "Price Drop"     },
  { value: "underlyingScore", label: "Underlying Score"},
];

/* ── defaults ───────────────────────────────────────────────────────────────── */

const DEFAULT_SERVER = {
  lookbackDays:       20,
  minPriceDrop:       10,
  minVolumeRatio:     2,
  optionVolumeRatio:  2,
  strikeRange:        2,
  expiry:             "both",
  optionType:         "both",
  maxSpreadPct:       2.0,
};

const DEFAULT_CLIENT = {
  signal: "All",
  sector: "All",
  search: "",
  sortBy: "smartScore",
};

/* ── select helper ───────────────────────────────────────────────────────────── */

function Sel({ id, label, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────────────────── */

export default function SmartReversalOptionFilters({
  contracts = [],
  onFilterChange,   // (filteredContracts) => void
  onParamChange,    // (serverParams) => void — triggers re-fetch
}) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [client, setClient] = useState(DEFAULT_CLIENT);

  // Dynamic sector list from live data
  const sectors = [
    "All",
    ...Array.from(new Set(contracts.map((x) => x.sector).filter(Boolean))).sort(),
  ];

  // Notify parent of server-param changes
  useEffect(() => {
    if (onParamChange) onParamChange(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    server.lookbackDays, server.minPriceDrop, server.minVolumeRatio,
    server.optionVolumeRatio, server.strikeRange, server.expiry,
    server.optionType, server.maxSpreadPct,
  ]);

  // Client-side filtering
  useEffect(() => {
    let filtered = [...contracts];

    if (client.search.trim()) {
      const kw = client.search.trim().toLowerCase();
      filtered = filtered.filter(
        (x) =>
          (x.symbol  ?? "").toLowerCase().includes(kw) ||
          (x.company ?? "").toLowerCase().includes(kw)
      );
    }
    if (client.signal !== "All") {
      filtered = filtered.filter((x) => x.signal === client.signal);
    }
    if (client.sector !== "All") {
      filtered = filtered.filter((x) => x.sector === client.sector);
    }

    // Sort
    filtered.sort((a, b) => {
      const av = a[client.sortBy] ?? 0;
      const bv = b[client.sortBy] ?? 0;
      if (client.sortBy === "priceDropPercent") return av - bv; // more negative first
      return bv - av;
    });

    onFilterChange(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, client]);

  const setS = useCallback((k, v) => setServer((p) => ({ ...p, [k]: v })), []);
  const setC = useCallback((k, v) => setClient((p) => ({ ...p, [k]: v })), []);

  const reset = () => {
    setServer(DEFAULT_SERVER);
    setClient(DEFAULT_CLIENT);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      {/* Row 1: server-side params */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Sel id="sro-lookback" label="Lookback" value={server.lookbackDays}
          onChange={(v) => setS("lookbackDays", Number(v))}>
          {LOOKBACK_OPTS.map((v) => <option key={v} value={v}>{v} Days</option>)}
        </Sel>

        <Sel id="sro-drop" label="Min Price Drop" value={server.minPriceDrop}
          onChange={(v) => setS("minPriceDrop", Number(v))}>
          {DROP_OPTS.map((v) => <option key={v} value={v}>{v}%+</option>)}
        </Sel>

        <Sel id="sro-stockvr" label="Stock Vol Ratio" value={server.minVolumeRatio}
          onChange={(v) => setS("minVolumeRatio", Number(v))}>
          {STOCK_VR_OPTS.map((v) => <option key={v} value={v}>{v}x+</option>)}
        </Sel>

        <Sel id="sro-optvr" label="Option Vol Ratio" value={server.optionVolumeRatio}
          onChange={(v) => setS("optionVolumeRatio", Number(v))}>
          {OPT_VR_OPTS.map((v) => <option key={v} value={v}>{v}x+</option>)}
        </Sel>

        <Sel id="sro-strike" label="Strike Range" value={server.strikeRange}
          onChange={(v) => setS("strikeRange", Number(v))}>
          {STRIKE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>

        <Sel id="sro-expiry" label="Expiry" value={server.expiry}
          onChange={(v) => setS("expiry", v)}>
          {EXPIRY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>

        <Sel id="sro-opttype" label="Option Type" value={server.optionType}
          onChange={(v) => setS("optionType", v)}>
          {OPT_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>

        <Sel id="sro-spread" label="Max Spread" value={server.maxSpreadPct}
          onChange={(v) => setS("maxSpreadPct", Number(v))}>
          {SPREAD_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>
      </div>

      {/* Row 2: client-side filters */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {/* Search */}
        <div className="relative xl:col-span-2">
          <FiSearch className="absolute left-3 top-3 text-slate-400" size={14} />
          <input
            id="sro-search"
            type="text"
            placeholder="Search symbol / company…"
            value={client.search}
            onChange={(e) => setC("search", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <Sel id="sro-signal" label="Signal" value={client.signal}
          onChange={(v) => setC("signal", v)}>
          {SIGNAL_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Sel>

        <Sel id="sro-sector" label="Sector" value={client.sector}
          onChange={(v) => setC("sector", v)}>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </Sel>

        <Sel id="sro-sort" label="Sort By" value={client.sortBy}
          onChange={(v) => setC("sortBy", v)}>
          {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Sel>

        <div className="flex items-end">
          <button
            id="sro-reset"
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <FiRotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
