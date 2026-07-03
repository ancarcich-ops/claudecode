// Re-derive tee positions from Golfbert's per-hole path geometry
// (`vectors` + `range`). This is the fix for the "right distance,
// wrong direction" tees that survived the fairway-centroid backfill.
//
// Why this works where the fairway projection didn't:
//
//   recompute-tee-from-fairway.ts projected the tee from the green
//   along the green -> fairway-centroid axis. That direction is a
//   straight-line approximation -- it's wrong on doglegs and nearly
//   random on par 3s (tiny or missing fairway polygon). Result: tees
//   at exactly the published distance but on the wrong side of the
//   green (e.g. in a pond across the property).
//
//   Golfbert's GBHole payload carries `vectors` and `range` -- the
//   drawn path of the hole from tee to green, bend-aware. The vector/
//   range point FARTHEST from the green is the tee end of the path,
//   i.e. where Golfbert actually drew the tee on their map. We use
//   that point as the direction anchor and place the tee along
//   green -> anchor at the published scorecard distance. Real
//   direction, correct distance. The import-time fallback in
//   src/lib/golfbert.ts already trusts this same geometry when a
//   teebox ships without coordinates.
//
// API cost: listHolesForCourse returns EVERY hole's vectors in one
// call, so this is ~1 call per course (~1,239 total for the full DB,
// under the 3,572/day quota) versus ~40/course for a re-import.
// Responses are cached to scripts/gb-holes-cache.json, so reruns and
// resumed runs are free.
//
// Usage (with prod DATABASE_URL + Golfbert creds loaded):
//   npx tsx scripts/recompute-tee-from-vectors.ts                  # dry-run
//   npx tsx scripts/recompute-tee-from-vectors.ts --course="Trump" # one course
//   npx tsx scripts/recompute-tee-from-vectors.ts --apply          # write
//
// Flags:
//   --apply           write teeLat/teeLng updates (default: dry-run)
//   --course="X"      only courses whose name contains X
//   --min-shift=N     only move a tee if the vector-derived position is
//                     >= N yards from the stored one (default 40y --
//                     below that the stored tee is close enough that
//                     churn isn't worth it)
//   --budget=N        stop after ~N Golfbert calls (default 1200);
//                     cached courses don't count, so re-running the
//                     next day continues where you left off
//
// Skips (reported in the summary):
//   - courses with no matched Golfbert id in scripts/golfbert-state.json
//   - holes with no stored green or published distance
//   - holes an admin pinned (greenFront/Back set)
//   - holes whose vectors give no usable anchor (anchor closer to the
//     green than half the published distance -- direction unreliable)

import "./_load-env";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";
import * as gb from "../src/lib/golfbert";
import { COURSE_PRESETS } from "../src/lib/courses";

type LL = { lat: number; lng: number };

const CACHE_PATH = "scripts/gb-holes-cache.json";
const STATE_PATH = "scripts/golfbert-state.json";

function parseArgs(argv: string[]) {
  const flags = { apply: false, course: "", minShift: 40, budget: 1200 };
  for (const a of argv.slice(2)) {
    if (a === "--apply") flags.apply = true;
    else if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--min-shift=")) {
      const n = parseInt(a.slice("--min-shift=".length), 10);
      if (Number.isFinite(n)) flags.minShift = n;
    } else if (a.startsWith("--budget=")) {
      const n = parseInt(a.slice("--budget=".length), 10);
      if (Number.isFinite(n)) flags.budget = n;
    }
  }
  return flags;
}

// name -> gbId, joined across COURSE_PRESETS (id -> name) and the
// import state file (presetId -> gbId).
function buildGbIdByName(): Map<string, number> {
  const out = new Map<string, number>();
  if (!existsSync(STATE_PATH)) return out;
  let state: Record<string, { kind?: string; presetId?: string; gbId?: number }>;
  try {
    state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return out;
  }
  const nameByPresetId = new Map(COURSE_PRESETS.map((p) => [p.id, p.name]));
  for (const entry of Object.values(state)) {
    if (entry?.kind !== "matched" || entry.gbId == null || !entry.presetId) continue;
    const name = nameByPresetId.get(entry.presetId);
    if (name) out.set(name, entry.gbId);
  }
  return out;
}

type CachedHole = {
  number: number;
  flag: LL | null;
  candidates: LL[]; // range.start/end + vector vertices
};
type HolesCache = Record<string, { fetchedAt: string; holes: CachedHole[] }>;

function loadCache(): HolesCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveCache(c: HolesCache) {
  writeFileSync(CACHE_PATH, JSON.stringify(c));
}

async function fetchHoleGeometry(gbId: number): Promise<CachedHole[]> {
  const resp = await gb.listHolesForCourse(gbId);
  return (resp.resources ?? []).map((h) => {
    const candidates: LL[] = [];
    if (h.range?.start?.lat != null && h.range?.start?.long != null)
      candidates.push({ lat: h.range.start.lat, lng: h.range.start.long });
    if (h.range?.end?.lat != null && h.range?.end?.long != null)
      candidates.push({ lat: h.range.end.lat, lng: h.range.end.long });
    for (const v of h.vectors ?? []) {
      if (v.lat != null && v.long != null)
        candidates.push({ lat: v.lat, lng: v.long });
    }
    return {
      number: h.number,
      flag:
        h.flagcoords?.lat != null && h.flagcoords?.long != null
          ? { lat: h.flagcoords.lat, lng: h.flagcoords.long }
          : null,
      candidates,
    };
  });
}

// Place a point `distanceYds` from `green` along the green -> anchor
// direction. Flat-earth math is fine at hole scale.
function projectAlong(green: LL, anchor: LL, distanceYds: number): LL | null {
  const latToM = 111320;
  const lngToM = 111320 * Math.cos((green.lat * Math.PI) / 180);
  const xM = (anchor.lng - green.lng) * lngToM;
  const yM = (anchor.lat - green.lat) * latToM;
  const mag = Math.sqrt(xM * xM + yM * yM);
  if (mag < 1) return null;
  const distM = distanceYds * 0.9144;
  return {
    lat: green.lat + ((yM / mag) * distM) / latToM,
    lng: green.lng + ((xM / mag) * distM) / lngToM,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const gbIdByName = buildGbIdByName();
  const cache = loadCache();

  const where = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(
    `${args.apply ? "APPLY" : "DRY-RUN"}: ${courses.length} course${courses.length === 1 ? "" : "s"} (min-shift=${args.minShift}y, budget=${args.budget} calls)\n`,
  );

  let calls = 0;
  let noGbId = 0;
  let fetchErrors = 0;
  let budgetStopped = false;
  let totalPlanned = 0;
  let totalApplied = 0;
  let totalNoAnchor = 0;
  let coursesTouched = 0;

  for (const course of courses) {
    const gbId = gbIdByName.get(course.name);
    if (gbId == null) {
      noGbId++;
      continue;
    }

    let entry = cache[String(gbId)];
    if (!entry) {
      if (calls >= args.budget) {
        budgetStopped = true;
        break;
      }
      try {
        const holes = await fetchHoleGeometry(gbId);
        entry = { fetchedAt: new Date().toISOString(), holes };
        cache[String(gbId)] = entry;
        calls++;
        if (calls % 25 === 0) saveCache(cache);
      } catch (e) {
        fetchErrors++;
        console.error(
          `  ! ${course.name}: Golfbert fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
    }
    const gbHoleByNumber = new Map(entry.holes.map((h) => [h.number, h]));

    const holes = await prisma.courseHole.findMany({
      where: {
        courseId: course.id,
        source: "golfbert",
        greenLat: { not: null },
        greenLng: { not: null },
        distanceYds: { not: null },
      },
      select: {
        id: true,
        hole: true,
        teeLat: true,
        teeLng: true,
        greenLat: true,
        greenLng: true,
        greenFrontLat: true,
        greenBackLat: true,
        distanceYds: true,
      },
      orderBy: { hole: "asc" },
    });

    type Plan = { holeId: string; hole: number; newTee: LL; shift: number | null };
    const plans: Plan[] = [];

    for (const h of holes) {
      if (h.greenFrontLat != null || h.greenBackLat != null) continue; // admin pinned
      const gbHole = gbHoleByNumber.get(h.hole);
      if (!gbHole || gbHole.candidates.length === 0) continue;
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const published = h.distanceYds!;

      // Direction anchor: the path point farthest from the green.
      let anchor: LL | null = null;
      let anchorD = -1;
      for (const c of gbHole.candidates) {
        const d = distanceYards(green, c);
        if (d > anchorD) {
          anchorD = d;
          anchor = c;
        }
      }
      // The anchor must sit meaningfully toward the tee -- if the whole
      // path hugs the green (< half the published distance out), the
      // direction is unreliable; leave the hole alone.
      if (!anchor || anchorD < published * 0.5) {
        totalNoAnchor++;
        continue;
      }

      const newTee = projectAlong(green, anchor, published);
      if (!newTee) continue;
      const shift =
        h.teeLat != null && h.teeLng != null
          ? Math.round(distanceYards({ lat: h.teeLat, lng: h.teeLng }, newTee))
          : null;
      if (shift != null && shift < args.minShift) continue;
      plans.push({ holeId: h.id, hole: h.hole, newTee, shift });
    }

    if (plans.length === 0) continue;
    coursesTouched++;
    totalPlanned += plans.length;
    console.log(`${course.name}  (${plans.length} tee${plans.length === 1 ? "" : "s"} to move)`);
    for (const p of plans) {
      console.log(
        `  hole ${p.hole.toString().padStart(2)}: -> ${p.newTee.lat.toFixed(5)},${p.newTee.lng.toFixed(5)}  (shift ${p.shift == null ? "new" : `${p.shift}y`})`,
      );
    }

    if (args.apply) {
      const chunkSize = 100;
      for (let i = 0; i < plans.length; i += chunkSize) {
        const chunk = plans.slice(i, i + chunkSize);
        await prisma.$transaction(
          chunk.map((p) =>
            prisma.courseHole.update({
              where: { id: p.holeId },
              data: { teeLat: p.newTee.lat, teeLng: p.newTee.lng },
            }),
          ),
        );
        totalApplied += chunk.length;
      }
    }
  }
  saveCache(cache);

  console.log(
    `\nSummary: ${totalPlanned} tees to move across ${coursesTouched} courses. ` +
      `${args.apply ? `Applied: ${totalApplied}.` : "Rerun with --apply to write."}`,
  );
  console.log(
    `Golfbert calls this run: ${calls}. Skipped: ${noGbId} courses with no matched gbId, ` +
      `${fetchErrors} fetch errors, ${totalNoAnchor} holes with no usable path anchor.`,
  );
  if (budgetStopped) {
    console.log(
      `Stopped at --budget=${args.budget}. Fetched courses are cached in ${CACHE_PATH}; rerun to continue.`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
