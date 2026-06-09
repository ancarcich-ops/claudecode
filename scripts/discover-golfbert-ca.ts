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
import "./_load-env";
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
  "bonsall", "pala", "jamul", "dulzura", "descanso",
  "mt laguna", "mount laguna", "tecate",
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
  "albany", "el cerrito", "richmond", "san pablo", "pinole", "hercules",
  "castro valley", "san lorenzo", "ashland", "cherryland",
  "palo alto", "menlo park", "redwood city", "san mateo", "burlingame",
  "atherton", "woodside", "portola valley", "hillsborough", "brisbane",
  "colma", "millbrae", "south san francisco", "daly city", "pacifica",
  "half moon bay", "san bruno", "san carlos", "belmont", "foster city",
  "santa clara", "san jose", "los gatos", "saratoga", "cupertino",
  "monte sereno",
  "sunnyvale", "mountain view", "campbell", "milpitas", "morgan hill",
  "gilroy", "los altos", "los altos hills",
  "santa cruz", "capitola", "aptos", "watsonville", "soquel",
  "scotts valley", "felton", "boulder creek",
  "monterey", "pebble beach", "carmel", "carmel valley", "salinas",
  "marina", "seaside", "pacific grove", "big sur",
  "hollister", "san juan bautista", "soledad", "greenfield", "king city",
  "napa", "yountville", "st helena", "calistoga", "rutherford",
  "oakville", "angwin",
  "sonoma", "glen ellen", "kenwood", "santa rosa", "petaluma", "novato",
  "san rafael", "san anselmo", "fairfax", "ross", "kentfield",
  "mill valley", "tiburon", "sausalito", "larkspur", "corte madera",
  "muir beach", "stinson beach", "bolinas", "point reyes station",
  "windsor", "healdsburg", "geyserville", "sebastopol", "rohnert park",
  "forestville", "guerneville", "occidental", "monte rio",
  "vallejo", "benicia", "martinez", "concord", "walnut creek",
  "pleasant hill", "lafayette", "orinda", "moraga", "alamo",
  "danville", "san ramon", "dublin", "pleasanton", "livermore",
  "sunol", "fairfield", "vacaville", "dixon", "rio vista", "isleton",
  "tracy", "manteca", "stockton", "modesto", "turlock", "merced",
  "lodi", "galt", "lathrop", "ripon", "ceres", "patterson",
  "atwater", "los banos", "madera",
  "fresno", "clovis", "visalia", "tulare", "porterville", "bakersfield",
  "selma", "kingsburg", "reedley", "sanger", "dinuba", "hanford",
  "lemoore", "delano", "wasco", "shafter", "arvin", "taft",
  "sacramento", "elk grove", "folsom", "roseville", "rocklin", "lincoln",
  "loomis", "newcastle", "granite bay", "el dorado hills",
  "rancho cordova", "carmichael", "fair oaks", "orangevale", "citrus heights",
  "west sacramento", "davis", "woodland", "wheatland",
  "auburn", "placerville", "diamond springs", "shingle springs",
  "georgetown", "pollock pines",
  "lake tahoe", "south lake tahoe", "truckee", "tahoe city",
  "tahoe vista", "kings beach", "carnelian bay", "homewood",
  "incline village", "stateline", "northstar", "olympic valley",
  "alpine meadows", "soda springs",
  "redding", "anderson", "red bluff", "corning",
  "chico", "paradise", "oroville", "gridley",
  "yuba city", "marysville",
  "hidden valley lake", "clearlake", "lakeport", "kelseyville",
  "middletown",
  "ukiah", "willits", "fort bragg", "mendocino", "boonville",
  "hopland", "philo", "navarro",
  "grass valley", "nevada city", "colfax", "downieville",
  "jackson", "sutter creek", "amador city", "plymouth", "ione",
  "murphys", "angels camp", "arnold", "valley springs", "san andreas",
  "sonora", "twain harte", "groveland",
  "eureka", "arcata", "mckinleyville", "trinidad", "ferndale",
  "fortuna", "rio dell", "garberville", "crescent city", "klamath",
];

// Suggest a region tag from the city. Coarse but fine for triage --
// the human reviewer can fix up edge cases. Falls back to "NC" for
// California cities we don't recognize (Northern California).
// CA gets a per-region split (LA/OC/IE/CV/SD/VC/NC). Other states map
// to a single region tag -- we don't have city-level granularity yet
// outside California. PNW = WA/OR/ID; CAR (Carolinas) covers the
// Southeast Atlantic; NE = Northeast; SE = Deep South; MW = Midwest.
// "NC" here is the *Northern California* region tag, not North Carolina
// (those go in CAR).
function suggestRegion(state: string, city: string | undefined): CourseRegion {
  const s = state.toUpperCase();
  if (s === "CA") return suggestRegionForCA(city);
  if (s === "TX") return "TX";
  if (s === "FL") return "FL";
  if (s === "AZ") return "AZ";
  if (s === "NV") return "NV";
  if (s === "UT") return "UT";
  if (s === "CO") return "CO";
  if (s === "HI") return "HI";
  if (s === "WA" || s === "OR" || s === "ID") return "PNW";
  if (["NC", "SC", "VA", "GA", "AL", "FL"].includes(s)) return "CAR";
  if (
    ["WI", "MN", "MI", "IL", "OH", "IN", "MO", "IA", "KS", "NE", "ND", "SD"].includes(s)
  ) {
    return "MW";
  }
  if (
    ["NY", "NJ", "PA", "MA", "CT", "RI", "MD", "DE", "VT", "NH", "ME", "DC"].includes(s)
  ) {
    return "NE";
  }
  if (["KY", "TN", "AR", "MS", "LA", "WV", "OK"].includes(s)) return "SE";
  return "NC";
}

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
  // ask GolfBert directly. Throttled to ~5 calls/sec to stay under
  // the 429 rate cap, with a retry-with-backoff on rate-limit so a
  // single dropped call doesn't lose the whole batch. The script
  // ALWAYS writes whatever it collected -- partial results are far
  // more useful than an exception with nothing to triage.
  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, ms));
  let stoppedEarly = false;
  let stopReason = "";
  // The per-city sweep relies on the CA city lists -- harmless for
  // other states (just wasted calls), but pointless. Gate it.
  if (
    flags.state.toUpperCase() === "CA" &&
    page === 1 &&
    (!lastResp || !lastResp.marker)
  ) {
    console.log(
      "[discover] State pagination returned a single page -- sweeping per-city to catch the rest...",
    );
    const cities = collectKnownCACities();
    console.log(`[discover] ${cities.length} candidate cities`);
    let cityCalls = 0;
    let consecutive429s = 0;
    for (const city of cities) {
      cityCalls++;
      let resp: gb.GBListResponse<gb.GBCourse> | null = null;
      // Retry loop on 429 with progressive backoff. After three
      // failed attempts we bail out of the sweep entirely -- the
      // candidates we already collected get written below.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          resp = await gb.searchCourses({
            state: flags.state,
            city,
            limit: flags.limit,
          });
          consecutive429s = 0;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("429")) {
            consecutive429s++;
            const waitMs = [5_000, 15_000, 45_000][attempt] ?? 60_000;
            console.log(
              `[discover] 429 on city '${city}', waiting ${waitMs / 1000}s (attempt ${attempt + 1}/3)...`,
            );
            await sleep(waitMs);
            continue;
          }
          throw err;
        }
      }
      if (!resp) {
        stoppedEarly = true;
        stopReason = `429 quota exhausted around city '${city}'`;
        console.log(`[discover] stopping sweep: ${stopReason}`);
        break;
      }
      const got = resp.resources?.length ?? 0;
      if (got > 0) {
        console.log(
          `[discover] city '${city}': +${got} (running total ${all.length + got})`,
        );
        for (const c of resp.resources ?? []) pushCourse(c);
      }
      // Quick polite delay between calls so we don't pin the rate
      // limiter. ~200ms keeps us around 5 calls/sec.
      await sleep(200);
      // Safety valve: if every recent call has been hitting 429s,
      // bail out so we don't loop on backoffs forever.
      if (consecutive429s >= 3) {
        stoppedEarly = true;
        stopReason = "3 consecutive 429s with backoff -- bailing";
        console.log(`[discover] stopping sweep: ${stopReason}`);
        break;
      }
    }
    console.log(
      `[discover] per-city sweep used ${cityCalls} calls${stoppedEarly ? " (stopped early)" : ""}`,
    );
  }

  console.log(
    `[discover] done. ${all.length} total unique courses${stoppedEarly ? ` (partial: ${stopReason})` : ""}`,
  );

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
      suggestedRegion: suggestRegion(flags.state, city),
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
