import { prisma } from "@/lib/db";
import {
  getCourseHazardsByName,
  getCourseHolesByName,
} from "@/lib/course";
import CoursePreview from "./CoursePreview";

// Admin: GPS-free hole-by-hole preview of imported course geometry.
// Re-uses HoleMiniMap with player=null so we can verify GolfBert (or
// OSM, or hand-marked) data from the office without driving to the
// course.

export default async function AdminCoursePreviewPage({
  params,
}: {
  params: { name: string };
}) {
  const name = decodeURIComponent(params.name);
  const course = await prisma.course.findUnique({ where: { name } });
  const [holeGeoByHole, hazardsByHole] = await Promise.all([
    getCourseHolesByName(name),
    getCourseHazardsByName(name),
  ]);
  const totalHoles = course?.parData
    ? (() => {
        try {
          const parsed = JSON.parse(course.parData);
          return Array.isArray(parsed) ? parsed.length : 18;
        } catch {
          return 18;
        }
      })()
    : 18;
  return (
    <CoursePreview
      courseName={name}
      totalHoles={totalHoles}
      holeGeoByHole={holeGeoByHole}
      hazardsByHole={hazardsByHole}
    />
  );
}
