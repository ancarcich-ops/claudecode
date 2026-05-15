export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-3 w-2/3" />
      </div>
      <div className="card p-1 sm:p-2 overflow-x-auto">
        <div className="p-2">
          <div className="flex items-center justify-between gap-2 pb-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-3 w-10" />
            ))}
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-2 py-2 border-t border-border"
            >
              <div className="skeleton h-4 w-28" />
              {[0, 1, 2, 3, 4].map((c) => (
                <div key={c} className="skeleton h-4 w-8" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
