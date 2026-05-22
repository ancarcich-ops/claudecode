// One-off importer: pulls real per-hole pars from Golfbert for every
// preset in COURSE_PRESETS and rewrites src/lib/courses.ts in place,
// replacing the standardized p(holes, total) seed with the real par
// array for each matched course.
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//     npx tsx scripts/import-golfbert-pars.ts [--dry-run] [--limit=N] \
//     [--id=preset-id] [--resume]
//
// Flags:
//   --dry-run     Run the search + fetch pass, write the match report,
//                 but DO NOT rewrite courses.ts.
//   --limit=N     Process only the first N presets (after filtering).
//                 Useful for a smoke test before running the full set.
//   --id=...      Process only one preset by id (still writes courses.ts
//                 unless --dry-run is set). Repeatable: --id=a --id=b.
//   --resume      Read the prior match report (if present) and skip any
//                 presets already classified.
//
// Outputs:
//   scripts/golfbert-match-report.json  -- structured report of every
//     attempt: matched / no-match / multi-match / skipped, with the
//     candidate list for multi-matches so they can be resolved by hand.
//   src/lib/courses.ts  -- rewritten in place; only the `pars: p(...)`
//     literal is touched, every other field (id, name, city, region,
//     access, holes, coords) is left untouched.
//
// Coverage caveat: Golfbert is US-focused. Region codes MX, UK, plus
// some Hawaii and Caribbean entries are skipped up-front -- they
// wouldn't match anyway and the search calls just burn quota.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { COURSE_PRESETS } from "../src/lib/courses";
import * as gb from "../src/lib/golfbert";

type Outcome =
  | {
      kind: "matched";
      presetId: string;
      gbId: number;
      gbName: string;
      gbCity?: string;
      pars: number[];
    }
  | { kind: "no-match"; presetId: string; query: string }
  | {
      kind: "multi-match";
      presetId: string;
      query: string;
      candidates: { id: number; name: string; city?: string }[];
    }
  | { kind: "skipped"; presetId: string; reason: string };

const REPORT_PATH = "scripts/golfbert-match-report.json";
const COURSES_PATH = "src/lib/courses.ts";

// Regions where Golfbert almost certainly has no data. Saves quota.
const SKIP_REGIONS = new Set(["MX", "UK"]);

// Common course-name suffixes to strip when the first search misses.
// Order matters -- longer phrases first so "Country Club" trims before
// "Club" alone catches a partial.
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
    resume: args.includes("--resume"),
    limit: null as number | null,
    ids: [] as string[],
  };
  for (const a of args) {
    if (a.startsWith("--limit=")) {
      flags.limit = parseInt(a.slice("--limit=".length), 10);
    }
    if (a.startsWith("--id=")) flags.ids.push(a.slice("--id=".length));
  }
  return flags;
}

function parseCityField(cityField: string): { city: string; state: string | null } {
  const parts = cityField.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { city: parts[0], state: parts[1] };
  return { city: cityField.trim(), state: null };
}

function stripSuffix(name: string): string {
  let trimmed = name;
  for (const suf of NAME_SUFFIXES) {
    const re = new RegExp(`\\s*[-]?\\s*${suf}$`, "i");
    if (re.test(trimmed)) {
      trimmed = trimmed.replace(re, "").trim();
      break;
    }
  }
  return trimmed;
}

function medianYardage(boxes: gb.GBHoleTeebox[]): number | null {
  const lengths = boxes
    .map((b) => b.length)
    .filter((l): l is number => Number.isFinite(l));
  if (lengths.length === 0) return null;
  const sorted = [...lengths].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function fetchPars(courseId: number): Promise<number[] | null> {
  const holesResp = await gb.listHolesForCourse(courseId);
  const holes = [...holesResp.resources].sort((a, b) => a.number - b.number);
  if (holes.length !== 18) return null;
  const pars: number[] = [];
  for (const hole of holes) {
    const teeboxResp = await gb.listTeeboxesForHole(hole.id);
    const yardage = medianYardage(teeboxResp.resources);
    const par = gb.pickPar(teeboxResp.resources, yardage);
    pars.push(par ?? 4);
    // Brief delay between teebox calls -- 18 per course adds up.
    await new Promise((r) => setTimeout(r, 100));
  }
  return pars;
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
  // First pass: exact name.
  let candidates = await searchOnce(preset.name, city, state);
  if (candidates.length > 0) return candidates;
  // Second pass: strip a known suffix and retry.
  const stripped = stripSuffix(preset.name);
  if (stripped !== preset.name) {
    candidates = await searchOnce(stripped, city, state);
    if (candidates.length > 0) return candidates;
  }
  // Third pass: drop the state -- some Golfbert records have malformed
  // state fields that filter out otherwise-valid matches.
  candidates = await searchOnce(preset.name, city, null);
  return candidates;
}

function pickBestMatch(
  candidates: gb.GBCourse[],
  preset: (typeof COURSE_PRESETS)[number],
): gb.GBCourse | "multi" | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Multiple -- try to disambiguate by city match. If exactly one city
  // matches, pick it; otherwise flag as multi for manual review.
  const { city } = parseCityField(preset.city);
  const cityMatches = candidates.filter(
    (c) =>
      c.address?.city &&
      c.address.city.toLowerCase().includes(city.toLowerCase()),
  );
  if (cityMatches.length === 1) return cityMatches[0];
  return "multi";
}

function loadPriorReport(): Map<string, Outcome> | null {
  if (!existsSync(REPORT_PATH)) return null;
  try {
    const json = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Outcome[];
    return new Map(json.map((o) => [o.presetId, o]));
  } catch {
    return null;
  }
}

function rewriteCoursesFile(matched: Extract<Outcome, { kind: "matched" }>[]): number {
  let source = readFileSync(COURSES_PATH, "utf8");
  let count = 0;
  for (const m of matched) {
    // Match the full preset object literal for this id and rewrite its
    // `pars: p(18, NN)` to the literal par array. Restricting the regex
    // to a single object (no nested braces) keeps each match scoped to
    // the right preset, even though every preset is on one line today.
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
    } else {
      console.warn(`  [warn] no rewrite match for ${m.presetId}`);
    }
  }
  writeFileSync(COURSES_PATH, source);
  return count;
}

async function main() {
  const flags = parseCli();
  const prior = flags.resume ? loadPriorReport() : null;
  if (flags.resume && prior) {
    console.log(`Resuming from prior report (${prior.size} entries).`);
  }

  let presets = COURSE_PRESETS.filter((p) => p.holes === 18);
  if (flags.ids.length > 0) {
    const idSet = new Set(flags.ids);
    presets = presets.filter((p) => idSet.has(p.id));
  } else {
    presets = presets.filter((p) => !SKIP_REGIONS.has(p.region));
  }
  if (flags.limit != null) presets = presets.slice(0, flags.limit);

  console.log(`Processing ${presets.length} presets...`);
  if (flags.dryRun) console.log("(dry-run: courses.ts will NOT be rewritten)");

  const outcomes: Outcome[] = [];
  let i = 0;
  for (const preset of presets) {
    i++;
    if (prior && prior.has(preset.id)) {
      const carry = prior.get(preset.id)!;
      outcomes.push(carry);
      if (carry.kind === "matched") {
        console.log(`[${i}/${presets.length}] (cached match) ${preset.id}`);
      }
      continue;
    }

    try {
      const candidates = await findCandidates(preset);
      const choice = pickBestMatch(candidates, preset);

      if (choice === null) {
        outcomes.push({
          kind: "no-match",
          presetId: preset.id,
          query: `${preset.name} | ${preset.city}`,
        });
        console.log(`[${i}/${presets.length}] no-match ${preset.id}`);
      } else if (choice === "multi") {
        outcomes.push({
          kind: "multi-match",
          presetId: preset.id,
          query: `${preset.name} | ${preset.city}`,
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name ?? "",
            city: c.address?.city,
          })),
        });
        console.log(
          `[${i}/${presets.length}] multi-match ${preset.id} (${candidates.length})`,
        );
      } else {
        const pars = await fetchPars(choice.id);
        if (!pars) {
          outcomes.push({
            kind: "skipped",
            presetId: preset.id,
            reason: "non-18 hole count from Golfbert",
          });
          console.log(`[${i}/${presets.length}] skip (not 18) ${preset.id}`);
        } else {
          outcomes.push({
            kind: "matched",
            presetId: preset.id,
            gbId: choice.id,
            gbName: choice.name ?? preset.name,
            gbCity: choice.address?.city,
            pars,
          });
          console.log(
            `[${i}/${presets.length}] matched ${preset.id} -> ${choice.id} (${choice.name})`,
          );
        }
      }
    } catch (err) {
      outcomes.push({
        kind: "skipped",
        presetId: preset.id,
        reason: `error: ${(err as Error).message}`,
      });
      console.log(
        `[${i}/${presets.length}] error ${preset.id}: ${(err as Error).message}`,
      );
    }

    // Polite delay between courses.
    await new Promise((r) => setTimeout(r, 250));
  }

  writeFileSync(REPORT_PATH, JSON.stringify(outcomes, null, 2));
  console.log(`\nMatch report written: ${REPORT_PATH}`);

  let rewriteCount = 0;
  if (!flags.dryRun) {
    const matched = outcomes.filter(
      (o): o is Extract<Outcome, { kind: "matched" }> => o.kind === "matched",
    );
    rewriteCount = rewriteCoursesFile(matched);
    console.log(`courses.ts rewrites: ${rewriteCount}`);
  }

  const counts = {
    matched: outcomes.filter((o) => o.kind === "matched").length,
    noMatch: outcomes.filter((o) => o.kind === "no-match").length,
    multiMatch: outcomes.filter((o) => o.kind === "multi-match").length,
    skipped: outcomes.filter((o) => o.kind === "skipped").length,
  };
  console.log("\n--- Summary ---");
  console.log(`Matched:     ${counts.matched}`);
  console.log(`No match:    ${counts.noMatch}`);
  console.log(`Multi-match: ${counts.multiMatch}`);
  console.log(`Skipped:     ${counts.skipped}`);
  if (!flags.dryRun) console.log(`Rewrites:    ${rewriteCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
