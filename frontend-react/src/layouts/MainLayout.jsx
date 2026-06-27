import { NavLink } from "react-router-dom";
import StatusBar from "../components/StatusBar";
import {
  FiHome,
  FiTrendingUp,
  FiGrid,
  FiStar,
  FiSettings,
} from "react-icons/fi";

const menuItems = [
  {
    name: "Dashboard",
    path: "/",
    icon: <FiHome size={18} />,
  },
  {
    name: "Index Options",
    path: "/index",
    icon: <FiTrendingUp size={18} />,
  },
  {
    name: "Stock Options",
    path: "/stocks",
    icon: <FiGrid size={18} />,
  },
  {
    name: "All Scanner",
    path: "/scanner",
    icon: <FiTrendingUp size={18} />,
  },
  {
    name: "Watchlist",
    path: "/watchlist",
    icon: <FiStar size={18} />,
  },
  {
    name: "Settings",
    path: "/settings",
    icon: <FiSettings size={18} />,
  },
];

export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Header */}

      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900">

        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-6">

          <div>

            <h1 className="text-2xl font-bold text-cyan-400">
              Options Pulse Tracker
            </h1>

            <p className="text-xs text-slate-400">
              Live Options Analytics Dashboard
            </p>

          </div>

          <div className="flex items-center gap-3">

            <span className="h-3 w-3 rounded-full bg-green-500"></span>

            <span className="text-sm text-green-400">
              LIVE
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
                `flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition
                ${
                  isActive
                    ? "bg-cyan-600 text-white"
                    : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.icon}

              {item.name}

            </NavLink>

          ))}

        </div>

      </nav>

      {/* Main Content */}

      <main className="mx-auto max-w-screen-2xl p-6">

        {children}

      </main>

      {/* Footer */}

      <footer className="border-t border-slate-800 bg-slate-900">

        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-3 text-sm text-slate-400">

          <span>
            Options Pulse Tracker v2.0
          </span>

          <span>
            Backend Status :
            <span className="ml-2 text-green-400">
              Connected
            </span>
          </span>

        </div>

      </footer>

    </div>
  );
}
