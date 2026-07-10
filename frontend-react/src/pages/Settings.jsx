import { useEffect, useState } from "react";

import {
  FiRefreshCw,
  FiMoon,
  FiSun,
  FiSave,
} from "react-icons/fi";

export default function Settings() {

  const [refreshInterval, setRefreshInterval] =
    useState(() => {

      return Number(
        localStorage.getItem("refreshInterval") || 10
      );

    });

  const [theme, setTheme] =
    useState(() => {

      return (
        localStorage.getItem("theme") ||
        "dark"
      );

    });

  const [saved, setSaved] =
    useState(false);

  useEffect(() => {

    localStorage.setItem(
      "refreshInterval",
      refreshInterval
    );

  }, [refreshInterval]);

  useEffect(() => {

    localStorage.setItem(
      "theme",
      theme
    );

    document.documentElement.dataset.theme =
      theme;

  }, [theme]);

  const saveSettings = () => {

    localStorage.setItem(
      "refreshInterval",
      refreshInterval
    );

    localStorage.setItem(
      "theme",
      theme
    );

    setSaved(true);

    setTimeout(() => {

      setSaved(false);

    }, 2000);

  };

  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold text-white">
          ⚙ Settings
        </h1>

        <p className="mt-2 text-slate-400">
          Customize your Options Pulse Tracker
        </p>

      </div>

      {/* Refresh */}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

        <div className="mb-4 flex items-center gap-2">

          <FiRefreshCw
            className="text-cyan-400"
          />

          <h2 className="text-xl font-semibold">

            Auto Refresh

          </h2>

        </div>

        <select

          value={refreshInterval}

          onChange={(e)=>

            setRefreshInterval(

              Number(e.target.value)

            )

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

      {/* Theme */}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">

        <div className="mb-4 flex items-center gap-2">

          {theme === "dark"

            ? <FiMoon className="text-cyan-400"/>

            : <FiSun className="text-yellow-400"/>

          }

          <h2 className="text-xl font-semibold">

            Theme

          </h2>

        </div>

        <select

          value={theme}

          onChange={(e)=>

            setTheme(

              e.target.value

            )

          }

          className="rounded-lg border border-slate-700 bg-slate-950 p-2"

        >

          <option value="dark">

            Dark

          </option>

          <option value="light">

            Light

          </option>

        </select>

      </div>

      {/* Save */}

      <button

        onClick={saveSettings}

        className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 text-white hover:bg-cyan-700"

      >

        <FiSave />

        Save Settings

      </button>

      {saved && (

        <div className="rounded-lg border border-green-700 bg-green-900/30 p-3 text-green-400">

          Settings saved successfully.

        </div>

      )}

    </div>

  );

}