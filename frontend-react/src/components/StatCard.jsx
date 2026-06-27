import clsx from "clsx";

export default function StatCard({
  title,
  value,
  subtitle = "",
  icon,
  color = "cyan",
}) {
  const colors = {
    cyan: "border-cyan-500 text-cyan-400",
    green: "border-green-500 text-green-400",
    red: "border-red-500 text-red-400",
    yellow: "border-yellow-500 text-yellow-400",
    blue: "border-blue-500 text-blue-400",
  };

  return (
    <div
      className={clsx(
        "rounded-xl border bg-slate-900 p-5 shadow-lg transition hover:scale-[1.02]",
        colors[color]
      )}
    >
      <div className="flex justify-between items-center">

        <div>

          <p className="text-sm text-slate-400">
            {title}
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {value}
          </h2>

          {subtitle && (
            <p className="mt-2 text-sm text-slate-500">
              {subtitle}
            </p>
          )}

        </div>

        <div className="text-4xl">
          {icon}
        </div>

      </div>
    </div>
  );
}
