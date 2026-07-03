// Re-pin tees from OpenStreetMap `golf=tee` features. No Golfbert API
// required -- this is the bulk fix path now that the subscription is
// gone.
//
// OSM mappers trace actual tee boxes on many courses (as ways, some as
// nodes), often with a `ref` tag carrying the hole number. We already
// trust the DB's greens and published distances, so matching is:
//
//   candidate tees for hole N = OSM tee features whose distance to
//   hole N's green is within tolerance of the published yardage
//   (max(20y, 12%)). A `ref` tag equal to the hole number wins
//   outright (verified loosely at 30% so a mis-tagged ref can't drag
//   a tee across the property). Otherwise best distance-fit wins,
//   with an ambiguity guard: if the runner-up fits nearly as well
//   (within 10y) but sits >80y from the winner, the hole is skipped
//   and reported instead of guessed -- that's the "two similar par 3s"
//   trap. Same-complex tee boxes (blue/white 30y apart) fall under
//   80y, where either pick lands ON the real tee complex.
//
// Each matched OSM feature is claimed by one hole (ref matches claim
// first), so two holes can't grab the same tee box.
//
// Overpass is free; we stay polite (1 req/sec) and cache every
// response to scripts/osm-tee-cache.json so reruns are instant. Full
// sweep of ~1,239 courses ≈ 25 minutes on the first run, seconds after.
//
// Usage (with prod DATABASE_URL loaded):
//   npx tsx scripts/recompute-tee-from-osm.ts                  # dry-run
//   npx tsx scripts/recompute-tee-from-osm.ts --course="Wilson" # one course
//   npx tsx scripts/recompute-tee-from-osm.ts --apply          # write
//
// Flags:
//   --apply            write teeLat/teeLng (default: dry-run)
//   --course="X"       only courses whose name contains X
//   --min-shift=N      only move a tee if the OSM position is >= N
//                      yards from the stored one (default 40y)
//   --refresh-cache    refetch Overpass data instead of using the cache
//
// Skips (counted in the summary): courses with no center coords or no
// OSM tees nearby, holes with no green/published distance, admin-pinned
// holes (greenFront/Back set), ambiguous matches.

import "./_load-env";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { distanceYards } from "../src/lib/course";

type LL = { lat: number; lng: number };

const CACHE_PATH = "scripts/osm-tee-cache.json";
const USER_AGENT = "sticks-golf/0.1 (https://sticks-golf.vercel.app)";
const RADIUS_M = 1500;

type OsmTee = { lat: number; lng: number; ref: number | null };
type TeeCache = Record<string, { fetchedAt: string; tees: OsmTee[] }>;

function parseArgs(argv: string[]) {
  const flags = {
    apply: false,
    course: "",
    // 15y, not 40: OSM boxes are surveyed positions, so even a ~25y
    // correction (stored tee just off the real box) is worth taking.
    minShift: 15,
    refreshCache: false,
    debug: false,
  };
  for (const a of argv.slice(2)) {
    if (a === "--apply") flags.apply = true;
    else if (a.startsWith("--course=")) flags.course = a.slice("--course=".length);
    else if (a.startsWith("--min-shift=")) {
      const n = parseInt(a.slice("--min-shift=".length), 10);
      if (Number.isFinite(n)) flags.minShift = n;
    } else if (a === "--refresh-cache") flags.refreshCache = true;
    else if (a === "--debug") flags.debug = true;
  }
  return flags;
}

function parsePoly(json: string | null): LL[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const pts: LL[] = [];
    for (const p of arr) {
      if (typeof p?.lat === "number" && typeof p?.lng === "number")
        pts.push({ lat: p.lat, lng: p.lng });
    }
    return pts.length > 0 ? pts : null;
  } catch {
    return null;
  }
}

// Angle between two points as seen from `origin`, in degrees [0, 180].
// Flat-earth approximation, fine at hole scale.
function bearingDiffDeg(origin: LL, a: LL, b: LL): number {
  const lngScale = Math.cos((origin.lat * Math.PI) / 180);
  const bearing = (p: LL) =>
    (Math.atan2((p.lng - origin.lng) * lngScale, p.lat - origin.lat) * 180) /
    Math.PI;
  const diff = Math.abs(bearing(a) - bearing(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function distToNearestVertex(p: LL, poly: LL[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of poly) {
    const d = distanceYards(p, q);
    if (d < best) best = d;
  }
  return best;
}

function loadCache(): TeeCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveCache(c: TeeCache) {
  writeFileSync(CACHE_PATH, JSON.stringify(c));
}

type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};
type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};
type OverpassEl = OverpassNode | OverpassWay;

function parseRef(tag: string | undefined): number | null {
  if (!tag) return null;
  const n = parseInt(tag, 10);
  return Number.isFinite(n) && n >= 1 && n <= 36 ? n : null;
}

async function fetchOsmTees(lat: number, lng: number): Promise<OsmTee[]> {
  const query = `
[out:json][timeout:30];
(
  way["golf"="tee"](around:${RADIUS_M},${lat},${lng});
  node["golf"="tee"](around:${RADIUS_M},${lat},${lng});
);
out body;
>;
out skel qt;
`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassEl[] };
  const els = data.elements ?? [];
  const nodesById = new Map<number, OverpassNode>();
  const ways: OverpassWay[] = [];
  for (const el of els) {
    if (el.type === "node") nodesById.set(el.id, el);
    else if (el.type === "way") ways.push(el);
  }
  const tees: OsmTee[] = [];
  for (const w of ways) {
    if (w.tags?.["golf"] !== "tee") continue;
    const pts = w.nodes
      .map((id) => nodesById.get(id))
      .filter((n): n is OverpassNode => !!n);
    if (pts.length === 0) continue;
    tees.push({
      lat: pts.reduce((a, n) => a + n.lat, 0) / pts.length,
      lng: pts.reduce((a, n) => a + n.lon, 0) / pts.length,
      ref: parseRef(w.tags?.["ref"]),
    });
  }
  // Standalone tagged nodes (rarer, but cheap to include).
  for (const n of nodesById.values()) {
    if (n.tags?.["golf"] !== "tee") continue;
    tees.push({ lat: n.lat, lng: n.lon, ref: parseRef(n.tags?.["ref"]) });
  }
  return tees;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  const cache: TeeCache = args.refreshCache ? {} : loadCache();

  const where = args.course
    ? { name: { contains: args.course, mode: "insensitive" as const } }
    : {};
  const courses = await prisma.course.findMany({
    where: where as never,
    select: { id: true, name: true, centerLat: true, centerLng: true },
    orderBy: { name: "asc" },
  });

  console.log(
    `${args.apply ? "APPLY" : "DRY-RUN"}: ${courses.length} course${courses.length === 1 ? "" : "s"} (min-shift=${args.minShift}y)\n`,
  );

  let fetched = 0;
  let noCenter = 0;
  let noTees = 0;
  let fetchErrors = 0;
  let totalPlanned = 0;
  let totalApplied = 0;
  let totalAmbiguous = 0;
  let coursesTouched = 0;

  for (const course of courses) {
    if (course.centerLat == null || course.centerLng == null) {
      noCenter++;
      continue;
    }
    let entry = cache[course.id];
    if (!entry) {
      try {
        const tees = await fetchOsmTees(course.centerLat, course.centerLng);
        entry = { fetchedAt: new Date().toISOString(), tees };
        cache[course.id] = entry;
        fetched++;
        if (fetched % 25 === 0) saveCache(cache);
        await sleep(1100); // Overpass politeness: 1 req/sec
      } catch (e) {
        fetchErrors++;
        console.error(
          `  ! ${course.name}: Overpass error: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
    }
    if (entry.tees.length === 0) {
      noTees++;
      continue;
    }

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
        fairwayPolygonJson: true,
      },
      orderBy: { hole: "asc" },
    });

    // Trusted geometry used to disambiguate candidates: each hole's
    // own fairway polygon, and the previous hole's green (for the
    // walk-distance signal on par 3s, which have no fairway).
    const greenByHole = new Map<number, LL>(
      holes.map((h) => [h.hole, { lat: h.greenLat!, lng: h.greenLng! }]),
    );
    const fairwayByHole = new Map<number, LL[] | null>(
      holes.map((h) => [h.hole, parsePoly(h.fairwayPolygonJson)]),
    );

    type Plan = {
      holeId: string;
      hole: number;
      newTee: LL;
      shift: number | null;
      via: "ref" | "distance";
      fit: number;
    };
    const plans: Plan[] = [];
    const claimed = new Set<OsmTee>();

    const eligible = holes.filter(
      (h) => h.greenFrontLat == null && h.greenBackLat == null,
    );

    // Pass 1: ref-tagged tees claim their hole outright (verified at a
    // loose 30% so a mis-tagged ref can't drag a tee across the map).
    for (const h of eligible) {
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const published = h.distanceYds!;
      const refMatches = entry.tees.filter(
        (t) =>
          !claimed.has(t) &&
          t.ref === h.hole &&
          Math.abs(distanceYards(green, t) - published) <=
            Math.max(40, published * 0.3),
      );
      if (refMatches.length === 0) continue;
      // Several ref-tagged boxes for the hole (one per color) -- take
      // the one whose distance best matches the published yardage.
      let best = refMatches[0];
      let bestFit = Infinity;
      for (const t of refMatches) {
        const fit = Math.abs(distanceYards(green, t) - published);
        if (fit < bestFit) {
          bestFit = fit;
          best = t;
        }
      }
      claimed.add(best);
      const newTee = { lat: best.lat, lng: best.lng };
      const shift =
        h.teeLat != null && h.teeLng != null
          ? Math.round(distanceYards({ lat: h.teeLat, lng: h.teeLng }, newTee))
          : null;
      if (shift != null && shift < args.minShift) continue;
      plans.push({
        holeId: h.id,
        hole: h.hole,
        newTee,
        shift,
        via: "ref",
        fit: Math.round(bestFit),
      });
    }

    // Pass 2: distance-fit + routing for holes not resolved by ref.
    // Distance alone is ambiguous on a dense property (86 tee features
    // on an 18-hole course means some OTHER hole's box often sits at a
    // similar distance from this green). Trump National debug traces
    // shaped these rules:
    //
    //   Gate (per candidate):
    //   - holes with a fairway polygon: the tee must sit within 200y
    //     of the hole's OWN fairway. 200 (not 120) because canyon-
    //     carry holes routinely put the back tee 130-170y behind the
    //     first fairway vertex.
    //   - par 3s (no fairway): the tee must be a plausible walk
    //     (<= 350y) from the PREVIOUS hole's green.
    //
    //   Selection (per hole): score = fit + 0.3 * walkFromPrevGreen.
    //   The walk term picks the candidate that fits the course's
    //   routing -- the real hole-15 tee is a 55y walk from green 14,
    //   the impostor 194y -- while staying subordinate to fit.
    //
    //   Ambiguity: only when the top two scores are close (<15) AND
    //   the candidates sit in genuinely different directions from the
    //   green (>25 degrees apart). Two boxes of the same complex on a
    //   long hole can be 140y apart yet ~15 degrees -- same answer
    //   either way. Two different par-3 tees 123y apart at a 131y
    //   radius are ~56 degrees -- a real fork, so skip.
    const doneHoles = new Set(plans.map((p) => p.holeId));
    // --debug: per-hole trace of every OSM tee inside a loose 100y fit
    // window and why it was or wasn't usable. Printed for unmatched
    // holes so gate thresholds can be tuned from data.
    const debugLog = new Map<number, string[]>();
    const dbg = (hole: number, msg: string) => {
      if (!args.debug) return;
      const list = debugLog.get(hole) ?? [];
      list.push(msg);
      debugLog.set(hole, list);
    };
    const teeLabel = (t: OsmTee) =>
      `${t.lat.toFixed(5)},${t.lng.toFixed(5)}${t.ref != null ? ` ref=${t.ref}` : ""}`;
    for (const h of eligible) {
      if (doneHoles.has(h.id)) continue;
      const green = { lat: h.greenLat!, lng: h.greenLng! };
      const published = h.distanceYds!;
      const tol = Math.max(20, published * 0.12);
      const fairway = fairwayByHole.get(h.hole) ?? null;
      const prevGreen = greenByHole.get(h.hole - 1) ?? null;

      type Scored = { t: OsmTee; fit: number; walk: number | null; score: number };
      const scored: Scored[] = [];
      for (const t of entry.tees) {
        const fit = Math.abs(distanceYards(green, t) - published);
        if (fit > tol) {
          if (fit <= 100) dbg(h.hole, `  ${teeLabel(t)} fit=±${Math.round(fit)}y REJECT fit>tol(${Math.round(tol)})`);
          continue;
        }
        if (claimed.has(t)) {
          dbg(h.hole, `  ${teeLabel(t)} fit=±${Math.round(fit)}y REJECT claimed by earlier hole`);
          continue;
        }
        if (fairway && fairway.length >= 3) {
          const fw = distToNearestVertex(t, fairway);
          if (fw > 200) {
            dbg(h.hole, `  ${teeLabel(t)} fit=±${Math.round(fit)}y REJECT fairway gate (${Math.round(fw)}y from own fairway)`);
            continue;
          }
        } else if (prevGreen) {
          const walk = distanceYards(t, prevGreen);
          if (walk > 350) {
            dbg(h.hole, `  ${teeLabel(t)} fit=±${Math.round(fit)}y REJECT prev-green gate (${Math.round(walk)}y walk from hole ${h.hole - 1} green)`);
            continue;
          }
        }
        const walk = prevGreen ? distanceYards(t, prevGreen) : null;
        const score = fit + (walk != null ? 0.3 * walk : 0);
        dbg(
          h.hole,
          `  ${teeLabel(t)} fit=±${Math.round(fit)}y walk=${walk != null ? `${Math.round(walk)}y` : "—"} score=${Math.round(score)} CANDIDATE`,
        );
        scored.push({ t, fit, walk, score });
      }
      if (args.debug && !debugLog.has(h.hole)) {
        dbg(h.hole, `  (no OSM tee within ±100y of published ${published}y)`);
      }
      if (scored.length === 0) continue;
      scored.sort((a, b) => a.score - b.score);
      // Stability rule: if the stored tee already sits on (or right
      // next to) a gated candidate box, that box corroborates the
      // stored position -- keep it rather than hopping to a different
      // box on a marginal score edge. Without this, a hole whose tee
      // was already correct (stored 16y from its OSM box) can get
      // yanked 100y+ to a similar-scoring rival.
      let best = scored[0];
      const stored =
        h.teeLat != null && h.teeLng != null
          ? { lat: h.teeLat, lng: h.teeLng }
          : null;
      if (stored) {
        const corroborating = scored
          .filter((s) => distanceYards(stored, s.t) <= 25)
          .sort((a, b) => a.fit - b.fit)[0];
        if (corroborating) {
          if (corroborating !== best) {
            dbg(
              h.hole,
              `  STABILITY: keeping ${teeLabel(corroborating.t)} (stored tee within 25y) over score-winner ${teeLabel(best.t)}`,
            );
          }
          best = corroborating;
        }
      }
      const runnerUp = scored.find((s) => s !== best);
      if (best === scored[0] && runnerUp && runnerUp.score - best.score < 15) {
        // Angular separation as seen from the green: same complex or a
        // genuine fork?
        const angle = bearingDiffDeg(green, best.t, runnerUp.t);
        if (angle > 25) {
          totalAmbiguous++;
          dbg(
            h.hole,
            `  AMBIGUOUS: ${teeLabel(best.t)} (score ${Math.round(best.score)}) vs ${teeLabel(runnerUp.t)} (score ${Math.round(runnerUp.score)}), ${Math.round(angle)}° apart from green`,
          );
          continue;
        }
      }
      claimed.add(best.t);
      const newTee = { lat: best.t.lat, lng: best.t.lng };
      const shift =
        h.teeLat != null && h.teeLng != null
          ? Math.round(distanceYards({ lat: h.teeLat, lng: h.teeLng }, newTee))
          : null;
      if (shift != null && shift < args.minShift) {
        dbg(h.hole, `  SETTLED: stored tee already within ${shift}y of ${teeLabel(best.t)} (< min-shift ${args.minShift})`);
        continue;
      }
      plans.push({
        holeId: h.id,
        hole: h.hole,
        newTee,
        shift,
        via: "distance",
        fit: Math.round(best.fit),
      });
    }

    if (plans.length === 0 && !args.debug) continue;
    if (plans.length > 0) {
      coursesTouched++;
      totalPlanned += plans.length;
    }
    plans.sort((a, b) => a.hole - b.hole);
    console.log(
      `${course.name}  (${plans.length} tee${plans.length === 1 ? "" : "s"} from OSM, ${entry.tees.length} features nearby)`,
    );
    for (const p of plans) {
      console.log(
        `  hole ${p.hole.toString().padStart(2)}: -> ${p.newTee.lat.toFixed(5)},${p.newTee.lng.toFixed(5)}  shift=${p.shift == null ? "new" : `${p.shift}y`}  via=${p.via} fit=±${p.fit}y`,
      );
    }
    if (args.debug) {
      const matchedHoles = new Set(plans.map((p) => p.hole));
      for (const h of eligible) {
        if (matchedHoles.has(h.hole)) continue;
        console.log(`  [debug] hole ${h.hole} (published ${h.distanceYds}y) unmatched:`);
        for (const line of debugLog.get(h.hole) ?? [
          "  (no OSM tee inside the ±100y fit window)",
        ]) {
          console.log(`  ${line}`);
        }
      }
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
    `\nSummary: ${totalPlanned} tees matched across ${coursesTouched} courses. ` +
      `${args.apply ? `Applied: ${totalApplied}.` : "Rerun with --apply to write."}`,
  );
  console.log(
    `Overpass fetches this run: ${fetched}. Skipped: ${noCenter} no center, ` +
      `${noTees} courses with no OSM tees nearby, ${fetchErrors} fetch errors, ` +
      `${totalAmbiguous} ambiguous holes left alone.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
