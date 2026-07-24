import { NavLink, useLocation } from "react-router-dom";
import {
  FiHome,
  FiTrendingUp,
  FiGrid,
  FiStar,
  FiSettings,
  FiWifi,
  FiWifiOff,
  FiClock,
  FiZap,
  FiTarget,
} from "react-icons/fi";

import { useMemo } from "react";

import { useScanner } from "../context/ScannerContext";

import StatusBar from "../components/StatusBar";

const menuItems = [
  {
    title: "Dashboard",
    path: "/",
    icon: <FiHome size={18} />,
  },
  {
    title: "Index Options",
    path: "/index",
    icon: <FiTrendingUp size={18} />,
  },
  {
    title: "Stock Options",
    path: "/stocks",
    icon: <FiGrid size={18} />,
  },
  {
    title: "All Scanner",
    path: "/scanner",
    icon: <FiTrendingUp size={18} />,
  },
  {
    title: "Equity Volume Surge",
    path: "/equity-volume-surge",
    icon: <FiTrendingUp size={18} />,
  },
  {
    title: "Smart Reversal Scanner",
    path: "/smart-reversal",
    icon: <FiZap size={18} />,
  },
  {
    title: "Smart Reversal Options",
    path: "/smart-reversal-options",
    icon: <FiTarget size={18} />,
  },
  {
    title: "Watchlist",
    path: "/watchlist",
    icon: <FiStar size={18} />,
  },
  {
    title: "Settings",
    path: "/settings",
    icon: <FiSettings size={18} />,
  },
];

export default function MainLayout({ children }) {

  const {
    backendConnected,
    lastRefresh,
  } = useScanner();

  const location = useLocation();

  const pageTitle = useMemo(() => {

    const page = menuItems.find(
      (x) => x.path === location.pathname
    );

    return page?.title || "Dashboard";

  }, [location.pathname]);

  return (

    <div className="min-h-screen bg-slate-950 text-white">

      {/* Header */}

      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 shadow-lg">

        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">

          <div>

            <h1 className="text-3xl font-bold text-cyan-400">
              Options Pulse Tracker
            </h1>

            <p className="text-sm text-slate-400">
              Professional Options Analytics Platform
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-5">

            <div className="flex items-center gap-2">

              {backendConnected ? (

                <FiWifi className="text-green-400" />

              ) : (

                <FiWifiOff className="text-red-400" />

              )}

              <span
                className={
                  backendConnected
                    ? "font-semibold text-green-400"
                    : "font-semibold text-red-400"
                }
              >
                {backendConnected
                  ? "Backend Online"
                  : "Backend Offline"}
              </span>

            </div>

            <div className="flex items-center gap-2 text-slate-400">

              <FiClock />

              <span>

                {lastRefresh
                  ? new Date(lastRefresh).toLocaleTimeString()
                  : "--:--:--"}

              </span>

            </div>

          </div>

        </div>

      </header>

      {/* Navigation */}

      <nav className="border-b border-slate-800 bg-slate-900">

        <div className="mx-auto flex max-w-screen-2xl gap-2 overflow-x-auto px-6 py-3">

          {menuItems.map((item) => (

            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-600 text-white shadow-lg"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {item.icon}

              {item.title}

            </NavLink>

          ))}

        </div>

      </nav>

      {/* Page Heading */}

      <div className="mx-auto max-w-screen-2xl px-6 pt-6">

        <h2 className="text-2xl font-bold text-white">

          {pageTitle}

        </h2>

      </div>

      {/* Main Content */}

      <main className="mx-auto max-w-screen-2xl p-6">

        {children}

      </main>

      {/* Footer */}

      <footer className="mx-auto max-w-screen-2xl px-6 pb-6">

        <StatusBar />

      </footer>

    </div>

  );

}