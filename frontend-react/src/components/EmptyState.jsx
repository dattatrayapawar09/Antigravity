export default function EmptyState({

  title,

  message,

}) {

  return (

    <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">

      <h2 className="text-2xl font-semibold">

        {title}

      </h2>

      <p className="mt-3 text-slate-400">

        {message}

      </p>

    </div>

  );

}
