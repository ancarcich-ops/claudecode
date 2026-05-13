// Curated course presets for the Los Angeles and Orange County area.
//
// Each preset carries the course's published par total and hole count. The
// per-hole `pars` array is a standardized layout that sums to that total -
// good enough to seed live odds at match creation. Creators can tweak any
// hole in the "Course pars" editor on the match page.

export type CourseAccess = "public" | "private" | "resort" | "municipal";
export type CourseRegion = "LA" | "OC" | "IE";

export type CoursePreset = {
  id: string;
  name: string;
  city: string;
  region: CourseRegion;
  access: CourseAccess;
  holes: 9 | 18;
  pars: number[];
};

// Standardized layouts that sum to common totals. Two par-3s and two par-5s
// per nine for par-72, etc. Where a course's published total is different,
// we swap par-5s for par-4s symmetrically.
const PAR_18_72 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const PAR_18_71 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 3, 4, 5];
const PAR_18_70 = [4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 3, 4, 5];
const PAR_9_36 = [4, 4, 3, 5, 4, 4, 3, 4, 5];
const PAR_9_35 = [4, 4, 3, 4, 4, 4, 3, 4, 5];
const PAR_9_33 = [4, 4, 3, 4, 3, 4, 4, 3, 4];

function p(holes: 9 | 18, total: number): number[] {
  if (holes === 9) {
    if (total === 36) return PAR_9_36;
    if (total === 35) return PAR_9_35;
    if (total === 33) return PAR_9_33;
  }
  if (holes === 18) {
    if (total === 72) return PAR_18_72;
    if (total === 71) return PAR_18_71;
    if (total === 70) return PAR_18_70;
  }
  // Fallback - all par 4s padded to the right length.
  return Array(holes).fill(4);
}

export const COURSE_PRESETS: CoursePreset[] = [
  // --- Los Angeles County ---
  {
    id: "riviera-cc",
    name: "Riviera Country Club",
    city: "Pacific Palisades",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "bel-air-cc",
    name: "Bel-Air Country Club",
    city: "Bel-Air",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 70),
  },
  {
    id: "lacc-north",
    name: "Los Angeles Country Club (North)",
    city: "Beverly Hills",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "wilshire-cc",
    name: "Wilshire Country Club",
    city: "Hancock Park",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "brentwood-cc",
    name: "Brentwood Country Club",
    city: "Brentwood",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "lakeside-gc",
    name: "Lakeside Golf Club",
    city: "Toluca Lake",
    region: "LA",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "rancho-park",
    name: "Rancho Park Golf Course",
    city: "West Los Angeles",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "griffith-wilson",
    name: "Griffith Park - Wilson Course",
    city: "Los Angeles",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "griffith-harding",
    name: "Griffith Park - Harding Course",
    city: "Los Angeles",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "hansen-dam",
    name: "Hansen Dam Golf Course",
    city: "Pacoima",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "balboa-gc",
    name: "Sepulveda Balboa Course",
    city: "Encino",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "encino-gc",
    name: "Sepulveda Encino Course",
    city: "Encino",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "westchester-gc",
    name: "Westchester Golf Course",
    city: "Westchester",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 64),
  },
  {
    id: "penmar-gc",
    name: "Penmar Golf Course",
    city: "Venice",
    region: "LA",
    access: "municipal",
    holes: 9,
    pars: p(9, 33),
  },
  {
    id: "brookside-1",
    name: "Brookside Golf Club - Course #1",
    city: "Pasadena",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "brookside-2",
    name: "Brookside Golf Club - Course #2",
    city: "Pasadena",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 70),
  },
  {
    id: "trump-la",
    name: "Trump National Golf Club Los Angeles",
    city: "Rancho Palos Verdes",
    region: "LA",
    access: "resort",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "industry-hills-eisenhower",
    name: "Industry Hills - Eisenhower",
    city: "City of Industry",
    region: "LA",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "industry-hills-zaharias",
    name: "Industry Hills - Babe Zaharias",
    city: "City of Industry",
    region: "LA",
    access: "public",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "rustic-canyon",
    name: "Rustic Canyon Golf Course",
    city: "Moorpark",
    region: "LA",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "angeles-national",
    name: "Angeles National Golf Club",
    city: "Sunland",
    region: "LA",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "sand-canyon-cc-valley-desert",
    name: "Sand Canyon CC - Valley/Desert",
    city: "Canyon Country",
    region: "LA",
    access: "private",
    holes: 18,
    pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 3, 4, 4, 4, 5],
  },
  {
    id: "sand-canyon-cc-desert-mountain",
    name: "Sand Canyon CC - Desert/Mountain",
    city: "Canyon Country",
    region: "LA",
    access: "private",
    holes: 18,
    pars: [4, 3, 4, 5, 3, 4, 4, 4, 5, 5, 4, 4, 3, 4, 3, 4, 4, 4],
  },
  {
    id: "sand-canyon-cc-mountain-valley",
    name: "Sand Canyon CC - Mountain/Valley",
    city: "Canyon Country",
    region: "LA",
    access: "private",
    holes: 18,
    pars: [5, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
  },

  // --- Orange County ---
  {
    id: "pelican-hill-south",
    name: "Pelican Hill - Ocean South",
    city: "Newport Coast",
    region: "OC",
    access: "resort",
    holes: 18,
    pars: p(18, 70),
  },
  {
    id: "pelican-hill-north",
    name: "Pelican Hill - Ocean North",
    city: "Newport Coast",
    region: "OC",
    access: "resort",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "strawberry-farms",
    name: "Strawberry Farms Golf Club",
    city: "Irvine",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "aliso-viejo-cc",
    name: "Aliso Viejo Country Club",
    city: "Aliso Viejo",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "tijeras-creek",
    name: "Tijeras Creek Golf Club",
    city: "Rancho Santa Margarita",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "tustin-ranch",
    name: "Tustin Ranch Golf Club",
    city: "Tustin",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "black-gold",
    name: "Black Gold Golf Club",
    city: "Yorba Linda",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "arroyo-trabuco",
    name: "Arroyo Trabuco Golf Club",
    city: "Mission Viejo",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "anaheim-hills",
    name: "Anaheim Hills Golf Course",
    city: "Anaheim Hills",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "coto-de-caza-south",
    name: "Coto de Caza - South Course",
    city: "Coto de Caza",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "coto-de-caza-north",
    name: "Coto de Caza - North Course",
    city: "Coto de Caza",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "newport-beach-cc",
    name: "Newport Beach Country Club",
    city: "Newport Beach",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "big-canyon-cc",
    name: "Big Canyon Country Club",
    city: "Newport Beach",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "mile-square-classic",
    name: "Mile Square - Classic Course",
    city: "Fountain Valley",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "mile-square-players",
    name: "Mile Square - Player's Course",
    city: "Fountain Valley",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "costa-mesa-mesa-linda",
    name: "Costa Mesa CC - Mesa Linda",
    city: "Costa Mesa",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 70),
  },
  {
    id: "costa-mesa-los-lagos",
    name: "Costa Mesa CC - Los Lagos",
    city: "Costa Mesa",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "monarch-beach",
    name: "Monarch Beach Golf Links",
    city: "Dana Point",
    region: "OC",
    access: "resort",
    holes: 18,
    pars: p(18, 70),
  },
  {
    id: "talega",
    name: "Talega Golf Club",
    city: "San Clemente",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "san-clemente-muni",
    name: "San Clemente Municipal Golf Course",
    city: "San Clemente",
    region: "OC",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "shorecliffs",
    name: "Shorecliffs Golf Club",
    city: "San Clemente",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "el-niguel-cc",
    name: "El Niguel Country Club",
    city: "Laguna Niguel",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "newport-beach-muni",
    name: "Newport Beach Golf Course",
    city: "Newport Beach",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 59),
  },
  {
    id: "santa-ana-cc",
    name: "Santa Ana Country Club",
    city: "Santa Ana",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "yorba-linda-cc",
    name: "Yorba Linda Country Club",
    city: "Yorba Linda",
    region: "OC",
    access: "private",
    holes: 18,
    pars: p(18, 71),
  },

  // --- Inland Empire ---
  {
    id: "oak-quarry",
    name: "Oak Quarry Golf Club",
    city: "Riverside",
    region: "IE",
    access: "public",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "goose-creek",
    name: "Goose Creek Golf Club",
    city: "Jurupa Valley",
    region: "IE",
    access: "public",
    holes: 18,
    pars: [4, 3, 4, 5, 3, 4, 5, 4, 3, 4, 3, 5, 4, 4, 4, 3, 5, 4],
  },
  {
    id: "hidden-valley",
    name: "Hidden Valley Golf Club",
    city: "Norco",
    region: "IE",
    access: "public",
    holes: 18,
    pars: [5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 5, 3, 4, 4],
  },
];

export function findPresetByName(name: string): CoursePreset | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return COURSE_PRESETS.find(
    (c) => c.name.toLowerCase() === normalized,
  );
}

export function searchPresets(query: string, limit = 8): CoursePreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return COURSE_PRESETS.slice(0, limit);
  return COURSE_PRESETS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.region.toLowerCase() === q,
  ).slice(0, limit);
}
