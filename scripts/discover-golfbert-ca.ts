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

// City lists per California region tag. Kept at module level so both
// suggestRegionForCA() and collectKnownCACities() can use them.

// Los Angeles County
const CITIES_LA = [
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

// Orange County
const CITIES_OC = [
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

// Inland Empire (Riverside / San Bernardino counties)
const CITIES_IE = [
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

// Coachella Valley
const CITIES_CV = [
  "palm springs", "palm desert", "rancho mirage", "indian wells",
  "la quinta", "indio", "coachella", "cathedral city", "thousand palms",
  "desert hot springs", "bermuda dunes", "thermal", "mecca",
];

// San Diego County
const CITIES_SD = [
  "san diego", "la jolla", "coronado", "del mar", "solana beach",
  "encinitas", "carlsbad", "oceanside", "vista", "san marcos",
  "escondido", "poway", "rancho santa fe", "rancho bernardo",
  "rancho penasquitos", "mira mesa", "scripps ranch", "tierrasanta",
  "chula vista", "national city", "imperial beach", "bonita",
  "el cajon", "santee", "lakeside", "lemon grove", "spring valley",
  "alpine", "ramona", "julian", "fallbrook", "valley center",
  "borrego springs", "warner springs", "campo", "pine valley",
];

// Ventura County
const CITIES_VC = [
  "ventura", "oxnard", "camarillo", "moorpark", "simi valley",
  "thousand oaks", "newbury park", "ojai", "santa paula", "fillmore",
  "port hueneme", "somis", "santa rosa valley",
];

// Northern California (Bay Area + Central Valley + Wine Country + coast).
// Big list -- per-city sweep covers it.
const CITIES_NC = [
  "san francisco", "oakland", "berkeley", "alameda", "emeryville",
  "san leandro", "hayward", "fremont", "union city", "newark",
  "palo alto", "menlo park", "redwood city", "san mateo", "burlingame",
  "millbrae", "south san francisco", "daly city", "pacifica",
  "half moon bay", "san bruno", "san carlos", "belmont", "foster city",
  "santa clara", "san jose", "los gatos", "saratoga", "cupertino",
  "sunnyvale", "mountain view", "campbell", "milpitas", "morgan hill",
  "gilroy", "los altos", "santa cruz", "capitola", "aptos", "watsonville",
  "monterey", "pebble beach", "carmel", "carmel valley", "salinas",
  "marina", "seaside", "pacific grove", "big sur",
  "napa", "yountville", "st helena", "calistoga", "rutherford",
  "sonoma", "santa rosa", "petaluma", "novato", "san rafael",
  "mill valley", "tiburon", "sausalito", "larkspur", "corte madera",
  "windsor", "healdsburg", "geyserville", "sebastopol", "rohnert park",
  "vallejo", "benicia", "martinez", "concord", "walnut creek",
  "danville", "san ramon", "dublin", "pleasanton", "livermore",
  "tracy", "manteca", "stockton", "modesto", "turlock", "merced",
  "fresno", "clovis", "visalia", "tulare", "porterville", "bakersfield",
  "sacramento", "elk grove", "folsom", "roseville", "rocklin",
  "granite bay", "el dorado hills", "auburn", "placerville",
  "lake tahoe", "south lake tahoe", "truckee", "tahoe city",
  "incline village", "kings beach", "olympic valley",
  "redding", "chico", "yuba city", "marysville",
  "hidden valley lake", "clearlake", "lakeport", "kelseyville",
  "ukiah", "willits", "fort bragg", "mendocino", "boonville",
  "eureka", "arcata", "crescent city",
];

// Suggest a region tag from the city. Coarse but fine for triage --
// the human reviewer can fix up edge cases. Falls back to "NC" for
// California cities we don't recognize (Northern California).
function suggestRegionForCA(city: string | undefined): CourseRegion {
  const c = (city ?? "").toLowerCase().trim();
  if (!c) return "NC";
  if (CITIES_LA.includes(c)) return "LA";
  if (CITIES_OC.includes(c)) return "OC";
  if (CITIES_IE.includes(c)) return "IE";
  if (CITIES_CV.includes(c)) return "CV";
  if (CITIES_SD.includes(c)) return "SD";
  if (CITIES_VC.includes(c)) return "VC";
  return "NC";
}

// Union of every region's city list, deduped. Used by the per-city
// fallback when state-only pagination short-circuits.
function collectKnownCACities(): string[] {
  const out = new Set<string>();
  for (const list of [
    CITIES_LA,
    CITIES_OC,
    CITIES_IE,
    CITIES_CV,
    CITIES_SD,
    CITIES_VC,
    CITIES_NC,
  ]) {
    for (const c of list) out.add(c);
  }
  return Array.from(out);
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

  // Strategy A: try marker pagination first. GolfBert documented the
  // marker cursor on /v1/courses/ but some callers (e.g. state=CA)
  // appear to return one page with no marker -- if that happens we
  // fall back to strategy B (per-city enumeration) automatically.
  console.log(
    `[discover] Listing GolfBert state=${flags.state}, limit=${flags.limit}, max-pages=${flags.maxPages}`,
  );
  const all: gb.GBCourse[] = [];
  const seenGbIds = new Set<number>();
  const pushCourse = (c: gb.GBCourse) => {
    if (seenGbIds.has(c.id)) return;
    seenGbIds.add(c.id);
    all.push(c);
  };

  let marker: string | undefined = undefined;
  let page = 0;
  let lastResp: gb.GBListResponse<gb.GBCourse> | null = null;
  while (page < flags.maxPages) {
    page++;
    const resp = await gb.searchCourses({
      state: flags.state,
      limit: flags.limit,
      marker,
    });
    lastResp = resp;
    const got = resp.resources?.length ?? 0;
    console.log(
      `[discover] page ${page}: +${got} courses (running total ${all.length + got}), marker=${resp.marker ?? "<none>"}`,
    );
    for (const c of resp.resources ?? []) pushCourse(c);
    if (!resp.marker) break;
    marker = resp.marker;
  }
  // If we only got one page and GolfBert returned no marker, dump
  // the raw envelope keys so we can see whether it lives under a
  // different field name (e.g. "nextMarker", "next", "cursor").
  if (page === 1 && lastResp && !lastResp.marker) {
    const keys = Object.keys(lastResp as unknown as Record<string, unknown>);
    console.log(`[discover] envelope keys on no-marker page: ${keys.join(", ")}`);
  }

  // Strategy B: per-city sweep when the state pagination short-circuits.
  // We rotate through every city our region heuristic recognizes and
  // ask GolfBert directly. Costs one call per city (cheap; ~250 calls
  // total for the union of every region list).
  if (page === 1 && (!lastResp || !lastResp.marker)) {
    console.log(
      "[discover] State pagination returned a single page -- sweeping per-city to catch the rest...",
    );
    const cities = collectKnownCACities();
    console.log(`[discover] ${cities.length} candidate cities`);
    let cityCalls = 0;
    for (const city of cities) {
      cityCalls++;
      const resp = await gb.searchCourses({
        state: flags.state,
        city,
        limit: flags.limit,
      });
      const got = resp.resources?.length ?? 0;
      if (got > 0) {
        console.log(
          `[discover] city '${city}': +${got} (running total ${all.length + got})`,
        );
        for (const c of resp.resources ?? []) pushCourse(c);
      }
    }
    console.log(`[discover] per-city sweep used ${cityCalls} calls`);
  }

  console.log(`[discover] done. ${all.length} total unique courses`);

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
