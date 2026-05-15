// Home-page skeleton. Mirrors the live/upcoming/settled layout so the
// pop-in on hard navigation feels like the same page filling in, not a
// new screen loading.
export default function HomeLoading() {
  return (
    <div className="space-y-10">
      <SectionSkeleton title="Live now" accent />
      <SectionSkeleton title="Upcoming" />
      <SectionSkeleton title="Settled" />
    </div>
  );
}

function SectionSkeleton({
  title,
  accent,
}: {
  title: string;
  accent?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {accent && (
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
        )}
        <h2
          className={
            "text-sm uppercase tracking-wider " +
            (accent ? "text-accent" : "text-mute")
          }
        >
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="card p-4 space-y-3"
            aria-hidden
          >
            <div className="flex items-center justify-between gap-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
            <div className="skeleton h-3 w-3/4" />
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-4 w-10" />
              </div>
              <div className="skeleton h-1.5 w-full rounded-full" />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-4 w-10" />
              </div>
              <div className="skeleton h-1.5 w-2/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
