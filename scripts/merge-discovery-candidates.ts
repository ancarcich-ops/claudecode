// Merge candidates from a discovery JSON into src/lib/courses.ts as new
// presets, and pre-stamp their gbIds in scripts/golfbert-state.json so
// the next import script run can pull real geometry via --reuse-id
// without searching.
//
// Run:
//   # CA sub-regions (LA, OC, IE, ...) read from discover-ca-candidates.json
//   npx tsx scripts/merge-discovery-candidates.ts --region=LA
//   npx tsx scripts/merge-discovery-candidates.ts --region=SD --limit=30
//
//   # Per-state discovery files (discover-{state}-candidates.json)
//   npx tsx scripts/merge-discovery-candidates.ts --state=AZ
//   npx tsx scripts/merge-discovery-candidates.ts --state=OR  # mapped to PNW
//
// Flags:
//   --region=LA|OC|IE|CV|SD|VC|NC|AZ|NV|UT|PNW|TX|FL|...   the CourseRegion
//                                        the new presets land under in
//                                        courses.ts. Required unless --state
//                                        is set (which maps for you).
//   --state=AZ|NV|UT|OR|WA|ID|TX|...     2-letter state code; auto-picks
//                                        scripts/discover-{state}-candidates.json
//                                        and maps the state to its CourseRegion
//                                        (e.g. OR -> PNW). Skips the in-file
//                                        region filter since per-state files
//                                        are already single-region.
//   --limit=N                            cap the batch size (default 999)
//   --in=path.json                       discovery JSON path
//                                        (default scripts/discover-ca-candidates.json
//                                        when --region is set without --state)
//   --dry-run                            print what would change, don't write
//
// Filters out driving ranges, par-3 / executive layouts, putting
// greens, and obvious duplicates by slug. Generates a stable slug
// from the name and ensures it doesn't collide with an existing
// preset id.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { COURSE_PRESETS, type CourseRegion } from "../src/lib/courses";

type Candidate = {
  gbId: number;
  name: string;
  city: string;
  state: string;
  zip?: string;
  suggestedRegion: CourseRegion;
  reason: string;
};

// Per-state discovery files live next to this script. The state's
// 2-letter code maps to the CourseRegion the new presets fall under
// (most states match 1:1; the PNW lump-region covers OR / WA / ID).
const STATE_TO_REGION: Record<string, CourseRegion> = {
  AZ: "AZ",
  NV: "NV",
  UT: "UT",
  OR: "PNW",
  WA: "PNW",
  ID: "PNW",
  MT: "PNW",
  AK: "PNW",
  TX: "TX",
  OK: "TX",
  FL: "FL",
  CO: "CO",
  HI: "HI",
  NM: "AZ",
  // Southeast lump
  NC: "SE", SC: "SE", GA: "SE", AL: "SE", TN: "SE", KY: "SE",
  VA: "SE", WV: "SE", AR: "SE", MS: "SE", LA: "SE",
  // Midwest lump
  IL: "MW", MI: "MW", WI: "MW", MN: "MW", MO: "MW",
  OH: "MW", IN: "MW", IA: "MW", KS: "MW", NE: "MW",
  ND: "MW", SD: "MW",
  // Northeast lump
  NY: "NE", NJ: "NE", PA: "NE", CT: "NE", MA: "NE",
  NH: "NE", VT: "NE", ME: "NE", RI: "NE", DE: "NE", MD: "NE",
};

function parseFlags(argv: string[]) {
  const flags: {
    region: string;
    state: string;
    limit: number;
    in: string;
    inExplicit: boolean;
    dryRun: boolean;
  } = {
    region: "",
    state: "",
    limit: 999,
    in: "",
    inExplicit: false,
    dryRun: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--region=")) flags.region = a.slice("--region=".length);
    else if (a.startsWith("--state="))
      flags.state = a.slice("--state=".length).toUpperCase();
    else if (a.startsWith("--limit="))
      flags.limit = parseInt(a.slice("--limit=".length), 10);
    else if (a.startsWith("--in=")) {
      flags.in = a.slice("--in=".length);
      flags.inExplicit = true;
    } else if (a === "--dry-run") flags.dryRun = true;
  }
  // --state shorthand: resolves the region + auto-picks the per-state
  // candidate file. Skips the in-file region filter since per-state
  // files are already single-region by construction.
  if (flags.state) {
    const mappedRegion = STATE_TO_REGION[flags.state];
    if (!mappedRegion) {
      console.error(
        `Unknown --state=${flags.state}. Add it to STATE_TO_REGION at the top of merge-discovery-candidates.ts.`,
      );
      process.exit(1);
    }
    if (!flags.region) flags.region = mappedRegion;
    if (!flags.in) flags.in = `scripts/discover-${flags.state.toLowerCase()}-candidates.json`;
  }
  if (!flags.region) {
    console.error(
      "Pass --region=LA|OC|IE|CV|SD|VC|NC|all (or --state=AZ|NV|UT|OR|TX|... for per-state files).",
    );
    process.exit(1);
  }
  if (!flags.in) flags.in = "scripts/discover-ca-candidates.json";
  return flags;
}

// Drop entries that aren't 18-hole regulation courses or that look
// like obvious junk in the GolfBert catalog. Conservative; if we drop
// something legit it'll surface again on the next discovery sweep.
function looksLikeRegulationCourse(name: string): boolean {
  const n = name.toLowerCase();
  const blocked = [
    "driving range",
    "putting green",
    "miniature",
    "mini golf",
    "footgolf",
    "disc golf",
    "topgolf",
    "practice center",
    "practice range",
    "academy",
    "learning center",
    "junior",
    "par 3",
    "par-3",
    "executive",
    "pitch and putt",
    "pitch & putt",
  ];
  for (const bad of blocked) if (n.includes(bad)) return false;
  return true;
}

// Slug an arbitrary course name into a stable, URL-safe id. Strips
// the boilerplate words (Country Club / Golf Course / etc.) so two
// near-duplicate names don't generate near-duplicate slugs.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+(country\s*club|golf\s*club|golf\s*course|golf\s*&\s*country\s*club|g\.c\.|c\.c\.|gcc|gc|cc)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Region label used in the // --- region --- header that the new
// presets land under in courses.ts. Match the existing comment style.
const REGION_LABELS: Record<CourseRegion, string> = {
  LA: "Los Angeles County (discovered)",
  OC: "Orange County (discovered)",
  IE: "Inland Empire (discovered)",
  CV: "Coachella Valley (discovered)",
  SD: "San Diego County (discovered)",
  VC: "Ventura County (discovered)",
  NC: "Northern California (discovered)",
  AZ: "Arizona (discovered)",
  NV: "Nevada (discovered)",
  UT: "Utah (discovered)",
  PNW: "Pacific Northwest (discovered)",
  TX: "Texas (discovered)",
  FL: "Florida (discovered)",
  CAR: "Carolinas (discovered)",
  MW: "Midwest (discovered)",
  MX: "Mexico (discovered)",
  HI: "Hawaii (discovered)",
  NE: "Northeast (discovered)",
  UK: "United Kingdom (discovered)",
  CO: "Colorado (discovered)",
  SE: "Southeast (discovered)",
};

type StateEntry = {
  kind: "matched";
  presetId: string;
  gbId: number;
  gbName: string;
  gbCity: string;
  pars: null;
  dbImported: false;
};

function main() {
  const flags = parseFlags(process.argv);
  const inPath = resolve(process.cwd(), flags.in);
  if (!existsSync(inPath)) {
    console.error(`Discovery JSON not found at ${flags.in}`);
    process.exit(1);
  }
  const all: Candidate[] = JSON.parse(readFileSync(inPath, "utf8"));
  console.log(`[merge] Loaded ${all.length} candidates from ${flags.in}`);

  const wantRegion = flags.region === "all" ? null : flags.region as CourseRegion;
  // Per-state discovery files (--state shorthand) are already single-
  // region by construction; skip the suggestedRegion filter so we don't
  // drop entries that lack the field or use a slightly different label.
  // Explicit --in or --region against the multi-region CA file still
  // gets the filter.
  const skipRegionFilter = !!flags.state;
  const inRegion = skipRegionFilter
    ? all
    : all.filter((c) => (wantRegion ? c.suggestedRegion === wantRegion : true));
  console.log(
    skipRegionFilter
      ? `[merge] ${inRegion.length} candidates loaded (per-state file, no in-file filter)`
      : `[merge] ${inRegion.length} candidates match region=${flags.region}`,
  );

  // Apply junk filter.
  const filtered = inRegion.filter((c) => looksLikeRegulationCourse(c.name));
  const droppedJunk = inRegion.length - filtered.length;
  if (droppedJunk > 0)
    console.log(`[merge] dropped ${droppedJunk} junk entries (ranges, par-3s, ...)`);

  // Dedupe vs existing preset slugs + within this batch itself.
  const existingSlugs = new Set(COURSE_PRESETS.map((p) => p.id));
  const seenSlugs = new Set<string>();
  type Plan = {
    preset: {
      id: string;
      name: string;
      city: string;
      region: CourseRegion;
      access: "public";
      holes: 18;
    };
    gbId: number;
  };
  const plan: Plan[] = [];
  let collisions = 0;
  for (const c of filtered) {
    let slug = slugify(c.name);
    if (!slug) continue;
    if (existingSlugs.has(slug) || seenSlugs.has(slug)) {
      // Try appending a city-derived suffix as a tiebreaker, then a
      // numeric one.
      const citySuffix = slugify(c.city).split("-")[0] ?? "";
      let tried = false;
      if (citySuffix && !existingSlugs.has(`${slug}-${citySuffix}`) && !seenSlugs.has(`${slug}-${citySuffix}`)) {
        slug = `${slug}-${citySuffix}`;
        tried = true;
      }
      if (!tried) {
        let n = 2;
        while (existingSlugs.has(`${slug}-${n}`) || seenSlugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      collisions++;
    }
    seenSlugs.add(slug);
    plan.push({
      preset: {
        id: slug,
        name: c.name,
        city: `${c.city}, ${c.state}`.replace(/^,\s*/, ""),
        region: c.suggestedRegion,
        access: "public", // pessimistic default; user can refine
        holes: 18,
      },
      gbId: c.gbId,
    });
    if (plan.length >= flags.limit) break;
  }
  console.log(
    `[merge] ${plan.length} presets will be added${collisions > 0 ? ` (${collisions} slug collisions handled)` : ""}`,
  );

  if (plan.length === 0) {
    console.log("[merge] nothing to do.");
    return;
  }

  if (flags.dryRun) {
    console.log("");
    console.log("--- Dry run preview (first 30) ---");
    for (const p of plan.slice(0, 30)) {
      console.log(`  ${p.preset.id}  gbId=${p.gbId}  ${p.preset.name}  (${p.preset.city})`);
    }
    if (plan.length > 30) console.log(`  ... +${plan.length - 30} more`);
    return;
  }

  // Generate the TypeScript snippet we'll splice into courses.ts.
  // When --state is set, pin the header to the state name so PNW-grouped
  // states (OR/WA/ID) still get distinguishable section comments.
  const PAR_18_72_LITERAL = "p(18, 72)";
  const baseLabel = REGION_LABELS[wantRegion ?? "NC"] ?? "Discovered";
  const headerLabel = flags.state
    ? `${flags.state} (discovered)`
    : baseLabel;
  const header = `\n  // --- ${headerLabel} ---\n`;
  const lines = plan.map(
    (p) =>
      `  { id: ${JSON.stringify(p.preset.id)}, name: ${JSON.stringify(p.preset.name)}, city: ${JSON.stringify(p.preset.city)}, region: "${p.preset.region}", access: "${p.preset.access}", holes: 18, pars: ${PAR_18_72_LITERAL} },`,
  );
  const snippet = header + lines.join("\n") + "\n";

  // Splice into courses.ts: insert before the closing `];` of the
  // COURSE_PRESETS array.
  const coursesPath = resolve(process.cwd(), "src/lib/courses.ts");
  const file = readFileSync(coursesPath, "utf8");
  const closeIdx = file.lastIndexOf("\n];");
  if (closeIdx === -1) {
    console.error("Couldn't find COURSE_PRESETS close `];` -- aborting.");
    process.exit(1);
  }
  const updated = file.slice(0, closeIdx) + snippet + file.slice(closeIdx);
  writeFileSync(coursesPath, updated);
  console.log(`[merge] courses.ts: appended ${plan.length} presets`);

  // Pre-stamp golfbert-state.json so a subsequent import script run
  // with --reuse-id pulls real geometry without a search round-trip.
  const statePath = resolve(process.cwd(), "scripts/golfbert-state.json");
  const state: Record<string, StateEntry | Record<string, unknown>> = JSON.parse(
    readFileSync(statePath, "utf8"),
  );
  const keys = Object.keys(state)
    .map(Number)
    .filter((n) => !isNaN(n));
  let nextIdx = (keys.length > 0 ? Math.max(...keys) : -1) + 1;
  for (const p of plan) {
    state[String(nextIdx)] = {
      kind: "matched",
      presetId: p.preset.id,
      gbId: p.gbId,
      gbName: p.preset.name,
      gbCity: p.preset.city.split(",")[0]?.trim() ?? "",
      pars: null,
      dbImported: false,
    };
    nextIdx++;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  console.log(`[merge] golfbert-state.json: added ${plan.length} entries`);
  console.log("");
  console.log("Next step:");
  console.log(
    "  npx tsx scripts/import-golfbert.ts --reuse-id --ids-from=<one of the new ids>",
  );
  console.log(
    "  -- or just rerun the standard --ids-from=<batch file> --force --reuse-id",
  );
}

main();
