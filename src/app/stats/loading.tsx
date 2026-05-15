export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-3 w-2/3" />
      </div>
      <div className="card p-5 space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-2">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5 space-y-3">
        <div className="skeleton h-3 w-32" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-2">
              <div className="skeleton h-3 w-12" />
              <div className="skeleton h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
