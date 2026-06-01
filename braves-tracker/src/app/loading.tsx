function SkeletonCard() {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3.5">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-10 rounded bg-white/10" />
        <div className="h-4 w-12 rounded bg-white/10" />
      </div>
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="h-[34px] w-[34px] rounded-xl bg-white/10" />
            <div className="h-3.5 flex-1 rounded bg-white/10" />
            <div className="h-4 w-5 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="mt-2 h-9 w-56 rounded-lg bg-white/10" />
        <div className="mt-2 h-3 w-40 rounded bg-white/10" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
