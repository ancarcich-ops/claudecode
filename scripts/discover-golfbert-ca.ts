// Discover GolfBert California courses that aren't in our preset
// catalog yet, so we can decide which ones to add for tomorrow's
// import batch.
//
// What it does:
//   1. Paginate searchCourses({state: "CA"}) until GolfBert stops
//      returning a `marker` (no more pages).
//   2. Collect every course it gives us.
//   3. Filter out any whose gbId already lives in
//      scripts/golfbert-state.json (already matched OR already
//      attempted) OR whose name already appears in COURSE_PRESETS
//      under a case-insensitive comparison.
//   4. Write the survivors to scripts/discover-ca-candidates.json
//      with name, city, state, zip, suggested region, and a
//      one-line `reason` -- ready for human triage.
//
// Run against the prod DB-backed env so the GolfBert credentials
// are present:
//   # PowerShell (Windows):
//   npx tsx scripts/discover-golfbert-ca.ts
//
//   # bash:
//   npx tsx scripts/discover-golfbert-ca.ts
//
// Cheap on GolfBert calls: 100 results per page * 25 pages = ~25
// search calls for the whole state. Well inside the daily budget.
//
// Flags:
//   --state=CA       Override the state (defaults to CA).
//   --limit=100      Per-page limit (default 100, GolfBert max).
//   --max-pages=50   Safety cap on page count (default 50).
//   --out=path.json  Output file (default scripts/discover-ca-candidates.json).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as gb from "../src/lib/golfbert";
import { COURSE_PRESETS, type CourseRegion } from "../src/lib/courses";

type StateEntry = {
  kind?: string;
  presetId?: string;
  gbId?: number;
};

type Candidate = {
  gbId: number;
  name: string;
  city: string;
  state: string;
  zip?: string;
  suggestedRegion: CourseRegion;
  reason: string;
};

function parseFlags(argv: string[]) {
  const flags = {
    state: "CA",
    limit: 100,
    maxPages: 50,
    out: "scripts/discover-ca-candidates.json",
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--state=")) flags.state = a.slice("--state=".length);
    else if (a.startsWith("--limit="))
      flags.limit = parseInt(a.slice("--limit=".length), 10);
    else if (a.startsWith("--max-pages="))
      flags.maxPages = parseInt(a.slice("--max-pages=".length), 10);
    else if (a.startsWith("--out="))
      flags.out = a.slice("--out=".length);
  }
  return flags;
}

// Suggest a region tag from the city. Coarse but fine for triage --
// the human reviewer can fix up edge cases. Falls back to "NC" for
// California cities we don't recognize (Northern California).
function suggestRegionForCA(city: string | undefined): CourseRegion {
  const c = (city ?? "").toLowerCase().trim();
  if (!c) return "NC";

  // Los Angeles County
  const LA = [
    "los angeles", "santa monica", "venice", "beverly hills", "westwood",
    "pasadena", "glendale", "burbank", "long beach", "lakewood",
    "torrance", "redondo beach", "hermosa beach", "manhattan beach",
    "el segundo", "hawthorne", "inglewood", "lawndale", "san pedro",
    "carson", "compton", "downey", "norwalk", "bellflower",
    "whittier", "santa clarita", "valencia", "newhall", "sylmar",
    "studio city", "sherman oaks", "encino", "tarzana", "woodland hills",
    "calabasas", "agoura hills", "thousand oaks", "westlake village",
    "palmdale", "lancaster", "north hollywood", "van nuys", "northridge",
    "chatsworth", "san fernando", "monrovia", "arcadia", "duarte",
    "san dimas", "covina", "west covina", "diamond bar", "rowland heights",
    "city of industry", "el monte", "south el monte", "alhambra",
    "monterey park", "rosemead", "san gabriel", "temple city",
    "culver city", "marina del rey", "playa vista", "view park",
    "rolling hills", "palos verdes", "rancho palos verdes",
  ];
  if (LA.includes(c)) return "LA";

  // Orange County
  const OC = [
    "anaheim", "santa ana", "irvine", "huntington beach", "newport beach",
    "newport coast", "costa mesa", "fountain valley", "garden grove",
    "westminster", "stanton", "buena park", "fullerton", "la habra",
    "yorba linda", "placentia", "brea", "tustin", "orange",
    "mission viejo", "laguna hills", "laguna niguel", "laguna beach",
    "aliso viejo", "lake forest", "rancho santa margarita", "coto de caza",
    "ladera ranch", "san juan capistrano", "dana point", "san clemente",
    "trabuco canyon", "silverado", "cypress", "los alamitos",
    "seal beach", "sunset beach", "midway city",
  ];
  if (OC.includes(c)) return "OC";

  // Inland Empire (Riverside / San Bernardino counties)
  const IE = [
    "riverside", "moreno valley", "corona", "norco", "perris", "menifee",
    "murrieta", "temecula", "lake elsinore", "wildomar", "hemet",
    "san jacinto", "beaumont", "banning", "calimesa",
    "san bernardino", "fontana", "rancho cucamonga", "ontario",
    "chino", "chino hills", "upland", "claremont", "pomona",
    "rialto", "colton", "redlands", "loma linda", "highland",
    "yucaipa", "victorville", "apple valley", "hesperia",
    "twentynine palms", "yucca valley", "joshua tree", "morongo valley",
    "barstow", "needles", "big bear lake", "big bear city",
    "running springs", "lake arrowhead", "crestline",
  ];
  if (IE.includes(c)) return "IE";

  // Coachella Valley
  const CV = [
    "palm springs", "palm desert", "rancho mirage", "indian wells",
    "la quinta", "indio", "coachella", "cathedral city", "thousand palms",
    "desert hot springs", "bermuda dunes", "thermal", "mecca",
  ];
  if (CV.includes(c)) return "CV";

  // San Diego County
  const SD = [
    "san diego", "la jolla", "coronado", "del mar", "solana beach",
    "encinitas", "carlsbad", "oceanside", "vista", "san marcos",
    "escondido", "poway", "rancho santa fe", "rancho bernardo",
    "rancho penasquitos", "mira mesa", "scripps ranch", "tierrasanta",
    "chula vista", "national city", "imperial beach", "bonita",
    "el cajon", "santee", "lakeside", "lemon grove", "spring valley",
    "alpine", "ramona", "julian", "fallbrook", "valley center",
    "borrego springs", "warner springs", "campo", "pine valley",
  ];
  if (SD.includes(c)) return "SD";

  // Ventura County
  const VC = [
    "ventura", "oxnard", "camarillo", "moorpark", "simi valley",
    "thousand oaks", "newbury park", "ojai", "santa paula", "fillmore",
    "port hueneme", "somis", "santa rosa valley",
  ];
  if (VC.includes(c)) return "VC";

  // Fallback: Northern California. Could refine further (Bay Area,
  // Central Valley, etc.) but NC works for the triage pass.
  return "NC";
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // Trim "The " prefix, "GC" / "G.C." suffixes, country club abbreviations.
    .replace(/^the\s+/i, "")
    .replace(/\s+(gc|g\.c\.|cc|c\.c\.|gcc|country\s*club|golf\s*club|golf\s*course|golf\s*&\s*country\s*club)$/i, "")
    .replace(/[^\w]+/g, "");
}

async function main() {
  const flags = parseFlags(process.argv);

  // Load known gbIds from the state file so we don't surface anything
  // we've already touched (matched, failed, skipped, whatever).
  const statePath = resolve(process.cwd(), "scripts/golfbert-state.json");
  const knownGbIds = new Set<number>();
  if (existsSync(statePath)) {
    const state: Record<string, StateEntry> = JSON.parse(
      readFileSync(statePath, "utf8"),
    );
    for (const v of Object.values(state)) {
      if (typeof v.gbId === "number") knownGbIds.add(v.gbId);
    }
  }
  console.log(`[discover] Loaded ${knownGbIds.size} known gbIds from state`);

  // Load preset name set for dedup. Normalized so "Riviera Country
  // Club" matches "Riviera CC" matches "The Riviera Country Club".
  const knownPresetNames = new Set<string>();
  for (const p of COURSE_PRESETS) knownPresetNames.add(normalizeName(p.name));
  console.log(
    `[discover] Loaded ${knownPresetNames.size} preset names (after normalization)`,
  );

  // Paginate the state's full course list.
  console.log(
    `[discover] Listing GolfBert state=${flags.state}, limit=${flags.limit}, max-pages=${flags.maxPages}`,
  );
  const all: gb.GBCourse[] = [];
  let marker: string | undefined = undefined;
  let page = 0;
  while (page < flags.maxPages) {
    page++;
    const resp = await gb.searchCourses({
      state: flags.state,
      limit: flags.limit,
      marker,
    });
    const got = resp.resources?.length ?? 0;
    console.log(
      `[discover] page ${page}: +${got} courses (running total ${all.length + got})`,
    );
    for (const c of resp.resources ?? []) all.push(c);
    if (!resp.marker) break;
    marker = resp.marker;
  }
  console.log(`[discover] done paginating. ${all.length} total courses`);

  // Diff.
  const candidates: Candidate[] = [];
  let skippedByGbId = 0;
  let skippedByName = 0;
  for (const c of all) {
    if (knownGbIds.has(c.id)) {
      skippedByGbId++;
      continue;
    }
    const norm = normalizeName(c.name);
    if (knownPresetNames.has(norm)) {
      skippedByName++;
      continue;
    }
    const city = c.address?.city ?? "";
    candidates.push({
      gbId: c.id,
      name: c.name,
      city,
      state: c.address?.state ?? flags.state,
      zip: c.address?.zip,
      suggestedRegion: suggestRegionForCA(city),
      reason: "new-gbid-and-name",
    });
  }
  console.log("");
  console.log("--- Diff summary ---");
  console.log(`Total CA courses returned: ${all.length}`);
  console.log(`Already known via gbId:    ${skippedByGbId}`);
  console.log(`Already known via name:    ${skippedByName}`);
  console.log(`New candidates:            ${candidates.length}`);

  // Sort by region then by city then by name so the JSON is browsable.
  candidates.sort((a, b) => {
    if (a.suggestedRegion !== b.suggestedRegion)
      return a.suggestedRegion.localeCompare(b.suggestedRegion);
    if (a.city !== b.city) return a.city.localeCompare(b.city);
    return a.name.localeCompare(b.name);
  });

  const outPath = resolve(process.cwd(), flags.out);
  writeFileSync(outPath, JSON.stringify(candidates, null, 2));
  console.log("");
  console.log(`Wrote ${candidates.length} candidates -> ${flags.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
