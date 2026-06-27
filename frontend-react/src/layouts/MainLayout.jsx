import { NavLink } from "react-router-dom";
import {
  FiHome,
  FiTrendingUp,
  FiGrid,
  FiStar,
  FiSettings,
} from "react-icons/fi";

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
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Header */}

      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 shadow-lg">

        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">

          <div>

            <h1 className="text-3xl font-bold text-cyan-400">
              Options Pulse Tracker
            </h1>

            <p className="text-sm text-slate-400">
              Professional Options Analytics Platform
            </p>

          </div>

          <div className="flex items-center gap-3">

            <span className="h-3 w-3 animate-pulse rounded-full bg-green-500"></span>

            <span className="font-semibold text-green-400">
              LIVE MARKET
            </span>

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
                `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-600 text-white shadow"
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

      {/* Main Content */}

      <main className="mx-auto max-w-screen-2xl p-6">

        {children}

      </main>

      {/* Status */}

      <footer className="mx-auto max-w-screen-2xl px-6 pb-6">

        <StatusBar />

      </footer>

    </div>
  );
}
