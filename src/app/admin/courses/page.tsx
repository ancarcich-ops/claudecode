import Link from "next/link";
import { prisma } from "@/lib/db";
import { COURSE_PRESETS } from "@/lib/courses";

// Lists every course we know about -- existing Course rows in the DB
// plus preset names that haven't been touched yet. Click one to edit.
export default async function AdminCoursesPage() {
  const dbCourses = await prisma.course.findMany({
    include: { holes: true },
    orderBy: { name: "asc" },
  });

  // Build a set of course names that already exist in the DB so we can
  // dedupe presets that have been touched.
  const dbNames = new Set(dbCourses.map((c) => c.name.toLowerCase()));
  const presetOnly = COURSE_PRESETS.filter(
    (p) => !dbNames.has(p.name.toLowerCase()),
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Course editor</h1>
        <p className="text-[12px] text-mute mt-1">
          Pick a course to drop tee and green pins on a satellite map.
        </p>
      </div>

      <section>
        <h2 className="text-[10px] uppercase tracking-wider text-mute mb-2">
          In DB ({dbCourses.length})
        </h2>
        <ul className="divide-y divide-border border border-border rounded-md">
          {dbCourses.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-mute">
              No courses yet.
            </li>
          )}
          {dbCourses.map((c) => {
            const greens = c.holes.filter((h) => h.greenLat != null).length;
            const tees = c.holes.filter((h) => h.teeLat != null).length;
            const hasCenter = c.centerLat != null && c.centerLng != null;
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/courses/${encodeURIComponent(c.name)}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-panel2/40"
                >
                  <span className="text-sm truncate">{c.name}</span>
                  <span className="text-[10px] text-mute font-mono shrink-0">
                    {hasCenter ? "·" : "no center · "}T {tees}/18 · G {greens}
                    /18
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-wider text-mute mb-2">
          Preset (untouched) ({presetOnly.length})
        </h2>
        <ul className="divide-y divide-border border border-border rounded-md max-h-96 overflow-y-auto">
          {presetOnly.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/courses/${encodeURIComponent(p.name)}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-panel2/40"
              >
                <span className="text-sm truncate">{p.name}</span>
                <span className="text-[10px] text-mute shrink-0">
                  {p.city}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
