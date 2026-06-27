import {
    FiTrendingUp,
    FiTrendingDown,
    FiBarChart2,
    FiActivity,
} from "react-icons/fi";

import { useScanner } from "../context/ScannerContext";

import StatCard from "./StatCard";

export default function DashboardSummary() {

    const { options } = useScanner();

    const bullish =
        options.filter(
            x => x.signal?.includes("Bull")
        ).length;

    const bearish =
        options.filter(
            x => x.signal?.includes("Bear")
        ).length;

    const avgRatio =
        options.length
            ? (
                  options.reduce(
                      (s, x) =>
                          s + x.volumeRatio,
                      0
                  ) / options.length
              ).toFixed(2)
            : 0;

    const maxScore =
        options.length
            ? Math.max(
                  ...options.map(
                      x => x.smartScore
                  )
              )
            : 0;

    return (

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">

            <StatCard

                title="Bullish"

                value={bullish}

                icon={<FiTrendingUp />}

                color="green"

            />

            <StatCard

                title="Bearish"

                value={bearish}

                icon={<FiTrendingDown />}

                color="red"

            />

            <StatCard

                title="Avg Volume Ratio"

                value={`${avgRatio}x`}

                icon={<FiBarChart2 />}

                color="cyan"

            />

            <StatCard

                title="Highest Smart Score"

                value={maxScore.toFixed(1)}

                icon={<FiActivity />}

                color="yellow"

            />

        </div>

    );

}
