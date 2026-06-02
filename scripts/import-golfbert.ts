// One-off Golfbert importer -- unified pass.
//
// For each preset in COURSE_PRESETS, this script:
//   1. searches Golfbert (name + city + state)
//   2. for the matched ID, calls importCourseFromGolfBert once to
//      pull holes + teeboxes + polygons + hazards in a single batch
//   3. writes per-hole pars into a courses.ts rewrite buffer
//   4. writes Course / CourseHole / CourseHazard rows to Postgres
//
// Then at the end, the rewrite buffer is applied to src/lib/courses.ts
// in place. This is the only pass we do over each course -- the old
// two-script flow double-fetched the same data and wasted ~half the
// daily quota. ~40 API calls per matched course.
//
// Why a single script: the All-Courses plan caps daily calls at 3,572.
// 420 US presets * 40 calls = ~17k calls = ~5 days of running. With
// two scripts that'd be ~10 days. One pass cuts it in half.
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//   DATABASE_URL=postgres://... \
//     npx tsx scripts/import-golfbert.ts [flags]
//
// Flags:
//   --dry-run                Don't write to Postgres or rewrite
//                            courses.ts. Useful for a smoke test.
//   --limit=N                Process at most N presets this run
//                            (after filtering).
//   --id=preset-id           Process a single preset (repeatable).
//   --ids-from=path          Read additional preset ids from a file
//                            (one per line; blank + #-comments
//                            ignored). Merges with --id flags.
//   --force                  Re-process even if the state file marks
//                            this preset as already done.
//   --reuse-id               Reuse each preset's already-matched
//                            Golfbert id from the state file instead of
//                            re-searching by name. Pair with --force to
//                            re-import a known batch (e.g. courses whose
//                            coords are in a since-replaced database)
//                            cheaply and without multi-match risk:
//                              --ids-from=scripts/day1-ids.txt --force --reuse-id
//   --daily-budget=N         Stop after ~N API calls (default 3400,
//                            buffer below Golfbert's 3,572 daily cap).
//                            On stop, writes state and exits cleanly so
//                            you can resume tomorrow.
//   --no-db                  Run the pars pass only -- skip the DB
//                            writes. For when you want to refresh
//                            courses.ts but leave Postgres alone.
//   --gb-id=N                Pin the Golfbert course id directly,
//                            skipping the search step. Used to
//                            resolve multi-matches or no-matches by
//                            hand: look up the right id in
//                            Golfbert's UI, then run
//                              --id=preset --gb-id=12345
//                            Requires exactly one --id. Implies
//                            --force so a prior multi-match/no-match
//                            state doesn't filter the preset out.
//
// State + outputs:
//   scripts/golfbert-state.json  -- per-preset outcome (matched /
//     no-match / multi-match / skipped / failed) + Golfbert ID +
//     fetched pars. Read at startup to resume; written after every
//     course so a crash or quota stop loses at most one course.
//   src/lib/courses.ts           -- pars literal updated in place at
//     end of run for every preset that was successfully matched.
//
// Cancel Golfbert after a successful full run -- the data is permanent
// in git (pars) + Postgres (polygons + hazards).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { COURSE_PRESETS } from "../src/lib/courses";
import * as gb from "../src/lib/golfbert";
import { findOrCreateCourseByName } from "../src/lib/course";
import { prisma } from "../src/lib/db";

type Pending = { kind: "pending"; presetId: string };
type Matched = {
  kind: "matched";
  presetId: string;
  gbId: number;
  gbName: string;
  gbCity?: string;
  pars: number[];
  dbImported: boolean;
};
type NoMatch = { kind: "no-match"; presetId: string; query: string };
type MultiMatch = {
  kind: "multi-match";
  presetId: string;
  query: string;
  candidates: { id: number; name: string; city?: string }[];
};
type Skipped = { kind: "skipped"; presetId: string; reason: string };
type Failed = {
  kind: "failed";
  presetId: string;
  error: string;
  // Preserve the prior match's Golfbert id + name when the previous
  // state was "matched" so a --reuse-id retry on the next run can
  // skip the search step and head straight back to the same course.
  // Otherwise a transient DB blip mid-run forces an expensive
  // re-search (and risks a multi-match that needs manual resolving).
  gbId?: number;
  gbName?: string;
  gbCity?: string;
};
type Outcome = Pending | Matched | NoMatch | MultiMatch | Skipped | Failed;

const STATE_PATH = "scripts/golfbert-state.json";
const COURSES_PATH = "src/lib/courses.ts";

// Region codes Golfbert almost certainly has no data for. Skipped up
// front to preserve quota.
const SKIP_REGIONS = new Set(["MX", "UK"]);

const NAME_SUFFIXES = [
  "Country Club",
  "Golf Club",
  "Golf Course",
  "Golf Links",
  "Golf Resort",
  "Golf & Country Club",
  "G.C.",
  "G.L.",
  "CC",
  "GC",
];

function parseCli() {
  const args = process.argv.slice(2);
  const flags = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    noDb: args.includes("--no-db"),
    // Reuse each preset's already-matched Golfbert id from the state file
    // instead of re-searching by name. Used with --force to re-import a
    // known batch (e.g. courses written to a since-replaced database)
    // cheaply and without multi-match risk.
    reuseId: args.includes("--reuse-id"),
    limit: null as number | null,
    dailyBudget: 3400,
    ids: [] as string[],
    gbId: null as number | null,
  };
  for (const a of args) {
    if (a.startsWith("--limit=")) {
      flags.limit = parseInt(a.slice("--limit=".length), 10);
    }
    if (a.startsWith("--id=")) flags.ids.push(a.slice("--id=".length));
    if (a.startsWith("--ids-from=")) {
      // Read additional preset ids from a file (one per line, blank
      // lines + lines starting with # are ignored). Useful for
      // pinning a "do these first" list on day 1 without a 40-line
      // --id chain on the command line.
      //
      // Splits on /\r?\n/ so Windows CRLF files don't leave a trailing
      // \r that defeats the `#.*$` comment strip (the . class in JS
      // regex doesn't match \r, so the regex would fail without this
      // and the entire line incl. trailing comment would end up in
      // flags.ids).
      const path = a.slice("--ids-from=".length);
      const lines = readFileSync(path, "utf8")
        .split(/\r?\n/)
        // Strip inline "# comment" tails so each line can carry a
        // trailing annotation (distance, city, etc.) -- handy for
        // hand-curated priority lists.
        .map((s) => s.replace(/#.*$/, "").trim())
        .filter((s) => s.length > 0);
      flags.ids.push(...lines);
    }
    if (a.startsWith("--daily-budget=")) {
      flags.dailyBudget = parseInt(a.slice("--daily-budget=".length), 10);
    }
    if (a.startsWith("--gb-id=")) {
      flags.gbId = parseInt(a.slice("--gb-id=".length), 10);
    }
  }
  if (flags.gbId != null) {
    if (flags.ids.length !== 1 || !Number.isFinite(flags.gbId)) {
      console.error(
        "--gb-id requires exactly one --id and a numeric Golfbert course id.",
      );
      process.exit(1);
    }
    // --gb-id implies --force so the preset's prior state (likely
    // multi-match or no-match) doesn't filter it out.
    flags.force = true;
  }
  return flags;
}

function parseCityField(cityField: string): { city: string; state: string | null } {
  const parts = cityField.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { city: parts[0], state: parts[1] };
  return { city: cityField.trim(), state: null };
}

function stripSuffix(name: string): string {
  for (const suf of NAME_SUFFIXES) {
    const re = new RegExp(`\\s*[-]?\\s*${suf}$`, "i");
    if (re.test(name)) return name.replace(re, "").trim();
  }
  return name;
}

function loadState(): Map<string, Outcome> {
  if (!existsSync(STATE_PATH)) return new Map();
  try {
    const arr = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Outcome[];
    return new Map(arr.map((o) => [o.presetId, o]));
  } catch {
    return new Map();
  }
}

function saveState(state: Map<string, Outcome>) {
  writeFileSync(STATE_PATH, JSON.stringify(Array.from(state.values()), null, 2));
}

async function searchOnce(
  name: string,
  city: string,
  state: string | null,
): Promise<gb.GBCourse[]> {
  const resp = await gb.searchCourses({
    name,
    city,
    state: state ?? undefined,
    limit: 5,
  });
  return resp.resources;
}

async function findCandidates(
  preset: (typeof COURSE_PRESETS)[number],
): Promise<gb.GBCourse[]> {
  const { city, state } = parseCityField(preset.city);
  let candidates = await searchOnce(preset.name, city, state);
  if (candidates.length > 0) return candidates;
  const stripped = stripSuffix(preset.name);
  if (stripped !== preset.name) {
    candidates = await searchOnce(stripped, city, state);
    if (candidates.length > 0) return candidates;
  }
  candidates = await searchOnce(preset.name, city, null);
  return candidates;
}

function pickBestMatch(
  candidates: gb.GBCourse[],
  preset: (typeof COURSE_PRESETS)[number],
): gb.GBCourse | "multi" | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const { city } = parseCityField(preset.city);
  const cityMatches = candidates.filter(
    (c) =>
      c.address?.city &&
      c.address.city.toLowerCase().includes(city.toLowerCase()),
  );
  if (cityMatches.length === 1) return cityMatches[0];
  return "multi";
}

async function writeCourseToDb(
  preset: (typeof COURSE_PRESETS)[number],
  imported: gb.ImportedCourse,
): Promise<void> {
  const course = await findOrCreateCourseByName(preset.name);
  const pars = imported.holes.map((h) => h.par ?? 4);
  await prisma.course.update({
    where: { id: course.id },
    data: {
      centerLat: imported.centerLat ?? course.centerLat ?? undefined,
      centerLng: imported.centerLng ?? course.centerLng ?? undefined,
      parData: JSON.stringify(pars),
    },
  });
  // Wipe golfbert-sourced hazards before re-inserting -- matches the
  // live admin import flow's behaviour.
  await prisma.courseHazard.deleteMany({ where: { courseId: course.id } });
  for (const h of imported.holes) {
    await prisma.courseHole.upsert({
      where: { courseId_hole: { courseId: course.id, hole: h.number } },
      update: {
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
      create: {
        courseId: course.id,
        hole: h.number,
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
    });
    for (const hz of h.hazards) {
      await prisma.courseHazard.create({
        data: {
          courseId: course.id,
          hole: h.number,
          kind: hz.kind,
          label: hz.label ?? null,
          lat: hz.lat,
          lng: hz.lng,
          contributedById: null,
        },
      });
    }
  }
}

function rewriteCoursesFile(matched: Matched[]): number {
  let source = readFileSync(COURSES_PATH, "utf8");
  let count = 0;
  for (const m of matched) {
    if (m.pars.length !== 18) continue;
    const escapedId = m.presetId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const re = new RegExp(
      `(\\{[^{}]*id:\\s*"${escapedId}"[^{}]*pars:\\s*)p\\(18,\\s*\\d+\\)`,
      "m",
    );
    const arrLit = `[${m.pars.join(", ")}]`;
    const replaced = source.replace(re, `$1${arrLit}`);
    if (replaced !== source) {
      source = replaced;
      count++;
    }
  }
  writeFileSync(COURSES_PATH, source);
  return count;
}

async function main() {
  const flags = parseCli();
  const state = loadState();
  console.log(`Loaded ${state.size} entries from ${STATE_PATH}`);

  let presets = COURSE_PRESETS.filter((p) => p.holes === 18);
  if (flags.ids.length > 0) {
    const idSet = new Set(flags.ids);
    presets = presets.filter((p) => idSet.has(p.id));
  } else {
    presets = presets.filter((p) => !SKIP_REGIONS.has(p.region));
  }

  // Drop presets that have already been processed unless --force.
  if (!flags.force && flags.ids.length === 0) {
    presets = presets.filter((p) => {
      const prior = state.get(p.id);
      // Re-attempt failures + multi-matches on rerun (multi-matches
      // because the user may have edited the catalog to disambiguate);
      // skip the rest.
      if (!prior) return true;
      return prior.kind === "failed" || prior.kind === "pending";
    });
  } else {
    // --force or --ids-from: still skip presets that are flat-out done
    // (matched + DB-imported). There's nothing left to redo for those,
    // and the GolfBert search step costs ~38 calls per preset -- a
    // resumed --ids-from run was burning the whole daily budget
    // re-fetching the front of the list before reaching the pending
    // tail.
    presets = presets.filter((p) => {
      const prior = state.get(p.id);
      if (!prior) return true;
      if (prior.kind === "matched" && prior.dbImported) return false;
      return true;
    });
  }

  if (flags.limit != null) presets = presets.slice(0, flags.limit);

  console.log(`Processing ${presets.length} presets (daily budget: ${flags.dailyBudget} calls)`);
  if (flags.dryRun) console.log("(dry-run: no DB writes, no courses.ts rewrite)");
  if (flags.noDb) console.log("(--no-db: pars only, skipping Postgres writes)");

  gb.resetGolfbertCallCount();
  const presetById = new Map(COURSE_PRESETS.map((p) => [p.id, p]));
  let stopped = false;

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const callsSoFar = gb.getGolfbertCallCount();
    if (callsSoFar >= flags.dailyBudget) {
      console.log(
        `\nHit daily budget (${callsSoFar} >= ${flags.dailyBudget}). Stopping cleanly. Resume tomorrow with same command.`,
      );
      stopped = true;
      break;
    }

    const tag = `[${i + 1}/${presets.length}, calls=${callsSoFar}]`;

    try {
      // --gb-id pins the Golfbert id directly and skips the search
      // step. Used to resolve multi-matches or no-matches by hand:
      // look up the right id in Golfbert's UI, then run
      //   --id=preset-id --gb-id=12345
      // The fake "choice" record carries forward the same shape the
      // search path produces, so the rest of the loop is unchanged.
      // Pin priority: explicit --gb-id > stored matched id (when
      // --reuse-id) > name search. Reusing the stored id skips the
      // search call and guarantees the same course as the prior import.
      const known = state.get(preset.id);
      // Reuse the gbId from either a matched or a failed prior entry.
      // (Failed rows carry forward the gbId from their previous match so
      // a transient DB hiccup mid-run doesn't force a costly re-search.)
      const reusableId =
        flags.reuseId
          ? known?.kind === "matched"
            ? known.gbId
            : known?.kind === "failed" && known.gbId != null
              ? known.gbId
              : null
          : null;
      const pinnedId = flags.gbId ?? reusableId;
      const choice: gb.GBCourse | "multi" | null = pinnedId != null
        ? ({
            id: pinnedId,
            name:
              (known?.kind === "matched"
                ? known.gbName
                : known?.kind === "failed"
                  ? known.gbName
                  : undefined) ?? preset.name,
            address: undefined,
          } as gb.GBCourse)
        : pickBestMatch(await findCandidates(preset), preset);

      if (choice === null) {
        state.set(preset.id, {
          kind: "no-match",
          presetId: preset.id,
          query: `${preset.name} | ${preset.city}`,
        });
        console.log(`${tag} no-match ${preset.id}`);
        saveState(state);
        continue;
      }
      if (choice === "multi") {
        // We only land here on the search path -- and findCandidates
        // returns the list synchronously into pickBestMatch, so we have
        // to re-run the search to capture the candidate list for the
        // state file. Cheap (already-cached on Golfbert's side in
        // practice), and avoids restructuring the function signatures.
        const candidates = await findCandidates(preset);
        state.set(preset.id, {
          kind: "multi-match",
          presetId: preset.id,
          query: `${preset.name} | ${preset.city}`,
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name ?? "",
            city: c.address?.city,
          })),
        });
        console.log(`${tag} multi-match ${preset.id} (${candidates.length})`);
        saveState(state);
        continue;
      }

      // One full import per matched course. ~38 calls.
      const imported = await gb.importCourseFromGolfBert(choice.id);
      const pars = imported.holes
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((h) => h.par ?? 4);

      if (pars.length !== 18) {
        state.set(preset.id, {
          kind: "skipped",
          presetId: preset.id,
          reason: `Golfbert returned ${pars.length} holes`,
        });
        console.log(`${tag} skip (non-18) ${preset.id}`);
        saveState(state);
        continue;
      }

      let dbImported = false;
      if (!flags.dryRun && !flags.noDb) {
        await writeCourseToDb(preset, imported);
        dbImported = true;
      }

      state.set(preset.id, {
        kind: "matched",
        presetId: preset.id,
        gbId: choice.id,
        gbName: choice.name ?? preset.name,
        gbCity: choice.address?.city,
        pars,
        dbImported,
      });
      console.log(
        `${tag} matched ${preset.id} -> ${choice.id} (${choice.name})${dbImported ? " +DB" : ""}`,
      );
      saveState(state);
    } catch (err) {
      const msg = (err as Error).message;
      const prior = state.get(preset.id);
      const carry =
        prior?.kind === "matched"
          ? { gbId: prior.gbId, gbName: prior.gbName, gbCity: prior.gbCity }
          : prior?.kind === "failed"
            ? { gbId: prior.gbId, gbName: prior.gbName, gbCity: prior.gbCity }
            : {};
      state.set(preset.id, {
        kind: "failed",
        presetId: preset.id,
        error: msg,
        ...carry,
      });
      console.log(`${tag} FAILED ${preset.id}: ${msg}`);
      saveState(state);
      // GolfBert daily quota exhausted -- every subsequent call will
      // 429 too, so stop now instead of burning the rest of the budget
      // on guaranteed failures. The failed presets stay "failed" in the
      // state file and retry automatically on the next run.
      if (msg.includes("429") || msg.includes("Limit Exceeded")) {
        console.log(
          `\nGolfBert rate limit hit (429). Stopping cleanly -- resume tomorrow once the quota resets; failed presets retry automatically.`,
        );
        break;
      }
    }

    // Polite delay between courses.
    await new Promise((r) => setTimeout(r, 250));
  }

  // Apply matched pars to courses.ts in one batch at the end.
  if (!flags.dryRun) {
    const matched = Array.from(state.values()).filter(
      (o): o is Matched => o.kind === "matched",
    );
    const rewriteCount = rewriteCoursesFile(matched);
    console.log(`\ncourses.ts rewrites: ${rewriteCount}`);
  }

  // Summary
  const counts = {
    matched: 0,
    noMatch: 0,
    multiMatch: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
  };
  for (const o of state.values()) {
    if (o.kind === "matched") counts.matched++;
    else if (o.kind === "no-match") counts.noMatch++;
    else if (o.kind === "multi-match") counts.multiMatch++;
    else if (o.kind === "skipped") counts.skipped++;
    else if (o.kind === "failed") counts.failed++;
    else counts.pending++;
  }
  console.log("\n--- Summary ---");
  console.log(`Calls used this run: ${gb.getGolfbertCallCount()}`);
  console.log(`Matched:     ${counts.matched}`);
  console.log(`No match:    ${counts.noMatch}`);
  console.log(`Multi-match: ${counts.multiMatch}`);
  console.log(`Skipped:     ${counts.skipped}`);
  console.log(`Failed:      ${counts.failed}`);
  if (stopped) console.log("\nResume with the same command tomorrow.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
