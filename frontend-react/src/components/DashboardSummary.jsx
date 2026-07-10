import {
  FiTrendingUp,
  FiTrendingDown,
  FiBarChart2,
  FiActivity,
  FiDatabase,
  FiMinus,
} from "react-icons/fi";

import { useMemo } from "react";

import { useScanner } from "../context/ScannerContext";

import StatCard from "./StatCard";

export default function DashboardSummary() {

  const {
    options,
    backendConnected,
  } = useScanner();

  const stats = useMemo(() => {

    const total = options.length;

    const bullish = options.filter(
      x => x.signal?.toLowerCase().includes("bull")
    ).length;

    const bearish = options.filter(
      x => x.signal?.toLowerCase().includes("bear")
    ).length;

    const neutral = total - bullish - bearish;

    const avgVolumeRatio =
      total > 0
        ? (
            options.reduce(
              (sum, x) => sum + (x.volumeRatio || 0),
              0
            ) / total
          ).toFixed(2)
        : "0.00";

    const avgSmartScore =
      total > 0
        ? (
            options.reduce(
              (sum, x) => sum + (x.smartScore || 0),
              0
            ) / total
          ).toFixed(1)
        : "0.0";

    const highestSmartScore =
      total > 0
        ? Math.max(
            ...options.map(
              x => x.smartScore || 0
            )
          ).toFixed(1)
        : "0.0";

    return {
      total,
      bullish,
      bearish,
      neutral,
      avgVolumeRatio,
      avgSmartScore,
      highestSmartScore,
    };

  }, [options]);

  return (

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">

      <StatCard
        title="Contracts"
        value={stats.total}
        icon={<FiDatabase />}
        color="blue"
      />

      <StatCard
        title="Bullish"
        value={stats.bullish}
        icon={<FiTrendingUp />}
        color="green"
      />

      <StatCard
        title="Bearish"
        value={stats.bearish}
        icon={<FiTrendingDown />}
        color="red"
      />

      <StatCard
        title="Neutral"
        value={stats.neutral}
        icon={<FiMinus />}
        color="gray"
      />

      <StatCard
        title="Avg Smart Score"
        value={stats.avgSmartScore}
        icon={<FiActivity />}
        color="yellow"
      />

      <StatCard
        title="Avg Vol Ratio"
        value={`${stats.avgVolumeRatio}x`}
        icon={<FiBarChart2 />}
        color="cyan"
      />
      <StatCard
        title="Highest Smart"
        value={stats.highestSmartScore}
        icon={<FiActivity />}
        color="purple"
      />
      <StatCard
        title="Backend"
        value={backendConnected ? "Online" : "Offline"}
        icon={<FiDatabase />}
        color={backendConnected ? "green" : "red"}
      />

    </div>

  );

}