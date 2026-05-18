import { prisma } from "@/lib/db";
import { findPresetByName } from "@/lib/courses";
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
  const preset = findPresetByName(name);
  const holes = preset?.holes ?? 18;

  // Compose a uniform per-hole geometry array for the editor.
  type HoleRecord = {
    hole: number;
    teeLat: number | null;
    teeLng: number | null;
    greenLat: number | null;
    greenLng: number | null;
  };
  const byHole = new Map<number, HoleRecord>();
  for (const h of course?.holes ?? []) byHole.set(h.hole, h);
  const holeRows = Array.from({ length: holes }, (_, i) => {
    const n = i + 1;
    const h = byHole.get(n);
    return {
      hole: n,
      teeLat: h?.teeLat ?? null,
      teeLng: h?.teeLng ?? null,
      greenLat: h?.greenLat ?? null,
      greenLng: h?.greenLng ?? null,
    };
  });

  return (
    <CourseEditor
      courseName={name}
      city={preset?.city ?? null}
      centerLat={course?.centerLat ?? null}
      centerLng={course?.centerLng ?? null}
      holes={holeRows}
    />
  );
}
