import clsx from "clsx";

export default function StatCard({
  title,
  value,
  subtitle = "",
  icon,
  color = "cyan",
}) {
  const colors = {
    cyan: {
      border: "border-cyan-500",
      text: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    green: {
      border: "border-green-500",
      text: "text-green-400",
      bg: "bg-green-500/10",
    },
    red: {
      border: "border-red-500",
      text: "text-red-400",
      bg: "bg-red-500/10",
    },
    yellow: {
      border: "border-yellow-500",
      text: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    blue: {
      border: "border-blue-500",
      text: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    gray: {
      border: "border-slate-500",
      text: "text-slate-300",
      bg: "bg-slate-700/20",
    },
  };

  const style = colors[color] || colors.cyan;

  return (
    <div
      className={clsx(
        "rounded-xl border bg-slate-900 p-5 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl",
        style.border
      )}
    >
      <div className="flex items-center justify-between">

        <div className="flex-1">

          <p className="text-sm font-medium text-slate-400">
            {title}
          </p>

          <h2 className="mt-2 truncate text-3xl font-bold text-white">
            {value}
          </h2>

          {subtitle && (
            <p className="mt-2 text-sm text-slate-500">
              {subtitle}
            </p>
          )}

        </div>

        <div
          className={clsx(
            "ml-4 rounded-full p-3",
            style.bg,
            style.text
          )}
        >
          <div className="text-2xl">
            {icon}
          </div>
        </div>

      </div>
    </div>
  );
}