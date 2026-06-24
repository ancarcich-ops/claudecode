// One-course geometry probe for Golfbert. Pulls the raw API responses
// for a given courseId and prints, per hole, every coordinate source
// we touch during import so we can see WHICH one is wrong when the
// tee-box audit fires.
//
// Why this exists: scripts/audit-tee-boxes.ts flagged ~92% of courses
// with computed tee->green distances roughly 2x the published yardage
// and inter-hole walks consistently 400-700y. Both `tee.coordinates`
// and `tee.length` come from the same Golfbert teebox record, so they
// should agree by construction. The loose joint is `h.flagcoords`,
// which we currently treat as the per-hole green flag. This script
// tests that assumption by comparing flagcoords against the green
// polygon's centroid for every hole.
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//     npx tsx scripts/probe-golfbert-geom.ts 1688
//
// Output columns per hole:
//   #    hole number
//   flag        h.flagcoords (what we currently store as green)
//   greenCen    centroid of the green polygon (the "true" green)
//   pickedTee   pickTeebox.coordinates (what we store as tee)
//   tee.len     pickTeebox.length (the published yardage)
//   tee->flag   distance from picked tee to flagcoords
//   tee->cen    distance from picked tee to green polygon centroid
//   flag->cen   distance between flagcoords and green polygon centroid
//   flag->ctr   distance between flagcoords and course.coordinates
//
// If `flag->cen` is consistently large (>100y) AND `tee->cen` ~ tee.len,
// flagcoords is the bug. If `flag->ctr` is ~0 across all holes, it
// confirms flagcoords is just the course center repeated per hole.

import "./_load-env";
import * as gb from "../src/lib/golfbert";
import { distanceYards } from "../src/lib/course";

function fmtLL(p: { lat: number; lng: number } | null): string {
  if (!p) return "          —          ";
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function dist(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): string {
  if (!a || !b) return "  —";
  return `${Math.round(distanceYards(a, b)).toString().padStart(5)}y`;
}

async function main() {
  const courseId = parseInt(process.argv[2] ?? "", 10);
  if (!Number.isFinite(courseId)) {
    console.error("Usage: npx tsx scripts/probe-golfbert-geom.ts <courseId>");
    process.exit(1);
  }

  const course = await gb.getCourse(courseId);
  const courseCenter = course.coordinates
    ? { lat: course.coordinates.lat, lng: course.coordinates.long }
    : null;
  console.log(`Course #${courseId}: ${course.name}`);
  console.log(`  course.coordinates (center): ${fmtLL(courseCenter)}`);
  console.log("");

  const holesResp = await gb.listHolesForCourse(courseId);
  const holes = (holesResp.resources ?? []).sort(
    (a, b) => a.number - b.number,
  );

  const header =
    "# |       flag         |      greenCen       |     pickedTee      |tee.len|tee->flag|tee->cen |flag->cen|flag->ctr";
  console.log(header);
  console.log("-".repeat(header.length));

  for (const h of holes) {
    const [polysResp, teesResp] = await Promise.all([
      gb.listPolygonsForHole(h.id),
      gb.listTeeboxesForHole(h.id),
    ]);
    const greenPoly = (polysResp.resources ?? []).find((p) =>
      p.surfacetype.toLowerCase().includes("green"),
    );
    const greenCentroid = greenPoly && greenPoly.polygon.length > 0
      ? {
          lat:
            greenPoly.polygon.reduce((a, p) => a + p.lat, 0) /
            greenPoly.polygon.length,
          lng:
            greenPoly.polygon.reduce((a, p) => a + p.long, 0) /
            greenPoly.polygon.length,
        }
      : null;

    const flag = h.flagcoords
      ? { lat: h.flagcoords.lat, lng: h.flagcoords.long }
      : null;

    const tee = gb.pickTeebox(teesResp.resources ?? []);
    const teePt = tee?.coordinates
      ? { lat: tee.coordinates.lat, lng: tee.coordinates.long }
      : null;
    const teeLen = tee?.length ?? null;

    console.log(
      [
        h.number.toString().padStart(2),
        fmtLL(flag),
        fmtLL(greenCentroid),
        fmtLL(teePt),
        (teeLen != null ? `${teeLen}y` : " —").padStart(6),
        dist(teePt, flag),
        dist(teePt, greenCentroid),
        dist(flag, greenCentroid),
        dist(flag, courseCenter),
      ].join(" | "),
    );
  }

  console.log("");
  console.log(`Golfbert calls used: ${gb.getGolfbertCallCount()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
