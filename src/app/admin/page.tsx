import Link from "next/link";

export default function AdminIndexPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h1 className="font-display text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-mute">
        Curator tools. Be careful — actions here bypass normal ownership
        checks.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/admin/courses"
          className="card p-4 hover:border-accent/40 transition-colors"
        >
          <div className="text-sm font-medium">Course geometry editor</div>
          <div className="text-[12px] text-mute mt-1">
            Drop tee and green pins on a satellite map. Curated data
            overrides OSM and user-marked pins.
          </div>
        </Link>
        <Link
          href="/admin/matches"
          className="card p-4 hover:border-accent/40 transition-colors"
        >
          <div className="text-sm font-medium">Matches</div>
          <div className="text-[12px] text-mute mt-1">
            Force-delete sloppy, abandoned, or duplicate matches without
            being the creator.
          </div>
        </Link>
      </div>
    </div>
  );
}
