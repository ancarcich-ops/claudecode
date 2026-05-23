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
  const hazards = course
    ? await prisma.courseHazard.findMany({
        where: { courseId: course.id },
        orderBy: [{ hole: "asc" }, { createdAt: "asc" }],
        select: { id: true, hole: true, kind: true, lat: true, lng: true },
      })
    : [];
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
      hazards={hazards}
    />
  );
}
