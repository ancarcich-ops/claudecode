import { prisma } from "@/lib/db";
import { COURSE_PRESET_COORDS, findPresetByName } from "@/lib/courses";
import CourseEditor from "./CourseEditor";

export default async function AdminCoursePage({
  params,
}: {
  params: { name: string };
}) {
  const name = decodeURIComponent(params.name);
  const course = await prisma.course.findUnique({
    where: { name },
    include: { holes: { orderBy: { hole: "asc" } } },
  });
  const hazards = course
    ? await prisma.courseHazard.findMany({
        where: { courseId: course.id },
        orderBy: [{ hole: "asc" }, { createdAt: "asc" }],
        select: { id: true, hole: true, kind: true, lat: true, lng: true },
      })
    : [];
  const preset = findPresetByName(name);
  const presetCoord = preset ? COURSE_PRESET_COORDS[preset.id] : null;
  const holes = preset?.holes ?? 18;

  // Compose a uniform per-hole geometry array for the editor.
  type TeeAlternative = {
    color: string;
    teeboxtype: string | null;
    lat: number;
    lng: number;
    yds: number | null;
  };
  type HoleRecord = {
    hole: number;
    teeLat: number | null;
    teeLng: number | null;
    greenLat: number | null;
    greenLng: number | null;
    teeAlternativesJson?: string | null;
  };
  const byHole = new Map<number, HoleRecord>();
  for (const h of (course?.holes ?? []) as HoleRecord[]) byHole.set(h.hole, h);
  const parseAlternates = (json: string | null | undefined): TeeAlternative[] => {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      if (!Array.isArray(v)) return [];
      return v
        .filter(
          (a: unknown): a is TeeAlternative =>
            !!a &&
            typeof a === "object" &&
            typeof (a as { lat?: unknown }).lat === "number" &&
            typeof (a as { lng?: unknown }).lng === "number",
        )
        .map((a) => ({
          color: String(a.color ?? ""),
          teeboxtype: a.teeboxtype ?? null,
          lat: a.lat,
          lng: a.lng,
          yds: typeof a.yds === "number" ? a.yds : null,
        }));
    } catch {
      return [];
    }
  };
  const holeRows = Array.from({ length: holes }, (_, i) => {
    const n = i + 1;
    const h = byHole.get(n);
    return {
      hole: n,
      teeLat: h?.teeLat ?? null,
      teeLng: h?.teeLng ?? null,
      greenLat: h?.greenLat ?? null,
      greenLng: h?.greenLng ?? null,
      teeAlternatives: parseAlternates(h?.teeAlternativesJson),
    };
  });

  return (
    <CourseEditor
      courseName={name}
      city={preset?.city ?? null}
      // Fall back to the catalog's clubhouse coord when the Course DB
      // row doesn't have a center yet -- saves the user from pasting
      // lat/lng manually for any preset we already have coords for.
      // The first save (any tee/green/hazard placement) will create
      // the Course row and write the saved center back.
      centerLat={course?.centerLat ?? (preset ? presetCoord?.lat ?? null : null)}
      centerLng={course?.centerLng ?? (preset ? presetCoord?.lng ?? null : null)}
      holes={holeRows}
      hazards={hazards}
    />
  );
}
