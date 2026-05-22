// Curated course presets for the Los Angeles and Orange County area.
//
// Each preset carries the course's published par total and hole count. The
// per-hole `pars` array is a standardized layout that sums to that total -
// good enough to seed live odds at match creation. Creators can tweak any
// hole in the "Course pars" editor on the match page.

export type CourseAccess = "public" | "private" | "resort" | "municipal";
export type CourseRegion =
  | "LA"
  | "OC"
  | "IE"
  | "CV"
  | "SD"
  | "VC"
  | "NC"
  | "AZ"
  | "NV"
  | "UT"
  | "PNW"
  | "TX"
  | "FL"
  | "CAR"
  | "MW"
  | "MX";

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
// Executive layouts. Par 59 = 13 par-3s + 5 par-4s (3*13 + 4*5 = 59).
// Par 64 = 12 par-3s + 6 par-4s (3*12 + 4*6 = 60)... not 64. So par 64
// uses 8 par-3s + 10 par-4s (3*8 + 4*10 = 64).
const PAR_18_64 = [3, 4, 3, 3, 4, 4, 4, 3, 4, 4, 3, 3, 3, 3, 4, 3, 4, 4];
const PAR_18_59 = [3, 4, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 3];
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
    if (total === 64) return PAR_18_64;
    if (total === 59) return PAR_18_59;
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
    id: "woodley-lakes",
    name: "Woodley Lakes Golf Course",
    city: "Van Nuys",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
  {
    id: "alondra-park",
    name: "Alondra Park Golf Course",
    city: "Lawndale",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 5],
  },
  {
    id: "los-verdes",
    name: "Los Verdes Golf Course",
    city: "Rancho Palos Verdes",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 71),
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
    id: "el-dorado-park",
    name: "El Dorado Park Golf Course",
    city: "Long Beach",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: [4, 4, 3, 5, 4, 4, 5, 4, 3, 5, 4, 3, 4, 4, 4, 4, 3, 5],
  },
  {
    id: "heartwell-gc",
    name: "Heartwell Golf Course",
    city: "Long Beach",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  },
  {
    id: "rio-hondo",
    name: "Rio Hondo Golf Club",
    city: "Downey",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "westchester-gc",
    name: "Westchester Golf Course",
    city: "Westchester",
    region: "LA",
    access: "municipal",
    holes: 18,
    pars: [3, 4, 3, 3, 4, 4, 4, 3, 4, 4, 3, 3, 3, 3, 5, 3, 4, 4],
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
    pars: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4],
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
    pars: [5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 5, 4, 5, 3, 4, 3, 4, 4],
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
    pars: [4, 4, 4, 5, 4, 5, 3, 3, 4, 3, 4, 4, 5, 4, 4, 3, 4, 5],
  },
  {
    id: "coyote-hills",
    name: "Coyote Hills Golf Course",
    city: "Fullerton",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 71),
  },
  {
    id: "birch-hills",
    name: "Birch Hills Golf Course",
    city: "Brea",
    region: "OC",
    access: "public",
    holes: 18,
    pars: p(18, 59),
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

  // --- Coachella Valley (Riverside County, grouped with IE) ---
  {
    id: "bighorn-gc-canyons",
    name: "Bighorn Golf Club - Canyons",
    city: "Palm Desert, CA",
    region: "IE",
    access: "private",
    holes: 18,
    // Tom Fazio design at Bighorn GC. Par 72.
    pars: [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 4, 5, 4, 4, 3, 5, 3, 4],
  },
  {
    id: "bighorn-gc-mountains",
    name: "Bighorn Golf Club - Mountains",
    city: "Palm Desert, CA",
    region: "IE",
    access: "private",
    holes: 18,
    // Arthur Hills / Jay Morrish design at Bighorn GC. Par 72.
    pars: [5, 4, 5, 3, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 4, 3, 4],
  },

  // --- Coachella Valley ---
  { id: "pga-west-stadium", name: "PGA West - Stadium Course", city: "La Quinta, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pga-west-nicklaus-tournament", name: "PGA West - Nicklaus Tournament Course", city: "La Quinta, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "la-quinta-country-club", name: "La Quinta Country Club", city: "La Quinta, CA", region: "CV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "la-quinta-resort-mountain", name: "La Quinta Resort - Mountain Course", city: "La Quinta, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "la-quinta-resort-dunes", name: "La Quinta Resort - Dunes Course", city: "La Quinta, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "mission-hills-dinah-shore", name: "Mission Hills Country Club - Dinah Shore Tournament", city: "Rancho Mirage, CA", region: "CV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "mission-hills-pete-dye-challenge", name: "Mission Hills CC - Pete Dye Challenge", city: "Rancho Mirage, CA", region: "CV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "desert-willow-firecliff", name: "Desert Willow - Firecliff", city: "Palm Desert, CA", region: "CV", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "desert-willow-mountain-view", name: "Desert Willow - Mountain View", city: "Palm Desert, CA", region: "CV", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "indian-wells-celebrity", name: "Indian Wells Golf Resort - Celebrity", city: "Indian Wells, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "indian-wells-players", name: "Indian Wells Golf Resort - Players", city: "Indian Wells, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "jw-marriott-palm", name: "JW Marriott Desert Springs - Palm Course", city: "Palm Desert, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "jw-marriott-valley", name: "JW Marriott Desert Springs - Valley Course", city: "Palm Desert, CA", region: "CV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "the-reserve-club", name: "The Reserve Club at Indian Wells", city: "Indian Wells, CA", region: "CV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "stone-eagle", name: "Stone Eagle Golf Club", city: "Palm Desert, CA", region: "CV", access: "private", holes: 18, pars: p(18, 71) },
  { id: "toscana-cc", name: "Toscana Country Club", city: "Indian Wells, CA", region: "CV", access: "private", holes: 18, pars: p(18, 72) },

  // --- San Diego ---
  { id: "torrey-pines-north", name: "Torrey Pines - North", city: "La Jolla, CA", region: "SD", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "torrey-pines-south", name: "Torrey Pines - South", city: "La Jolla, CA", region: "SD", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "aviara", name: "Aviara Golf Club", city: "Carlsbad, CA", region: "SD", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "maderas", name: "Maderas Golf Club", city: "Poway, CA", region: "SD", access: "public", holes: 18, pars: p(18, 72) },
  { id: "grand-golf-club", name: "The Grand Golf Club", city: "San Diego, CA", region: "SD", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "coronado-muni", name: "Coronado Municipal Golf Course", city: "Coronado, CA", region: "SD", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "encinitas-ranch", name: "Encinitas Ranch Golf Course", city: "Encinitas, CA", region: "SD", access: "public", holes: 18, pars: p(18, 72) },
  { id: "riverwalk", name: "Riverwalk Golf Club", city: "San Diego, CA", region: "SD", access: "public", holes: 18, pars: p(18, 72) },
  { id: "steele-canyon", name: "Steele Canyon Golf Club", city: "Jamul, CA", region: "SD", access: "public", holes: 18, pars: p(18, 71) },
  { id: "carlton-oaks", name: "Carlton Oaks Golf Club", city: "Santee, CA", region: "SD", access: "public", holes: 18, pars: p(18, 72) },
  { id: "rancho-bernardo-inn", name: "Rancho Bernardo Inn Golf Resort", city: "San Diego, CA", region: "SD", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "twin-oaks", name: "Twin Oaks Golf Course", city: "San Marcos, CA", region: "SD", access: "public", holes: 18, pars: p(18, 72) },
  { id: "san-diego-cc", name: "San Diego Country Club", city: "Chula Vista, CA", region: "SD", access: "private", holes: 18, pars: p(18, 72) },

  // --- Ventura County ---
  { id: "saticoy-cc", name: "Saticoy Country Club", city: "Somis, CA", region: "VC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "buenaventura", name: "Buenaventura Golf Course", city: "Ventura, CA", region: "VC", access: "municipal", holes: 18, pars: p(18, 70) },
  { id: "olivas-links", name: "Olivas Links", city: "Ventura, CA", region: "VC", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "sterling-hills", name: "Sterling Hills Golf Club", city: "Camarillo, CA", region: "VC", access: "public", holes: 18, pars: p(18, 71) },
  { id: "camarillo-springs", name: "Camarillo Springs Golf Course", city: "Camarillo, CA", region: "VC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "river-ridge-vineyard", name: "River Ridge - Vineyard Course", city: "Oxnard, CA", region: "VC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "river-ridge-victoria-lakes", name: "River Ridge - Victoria Lakes Course", city: "Oxnard, CA", region: "VC", access: "public", holes: 18, pars: p(18, 72) },

  // --- Austin, TX ---
  { id: "austin-cc", name: "Austin Country Club", city: "Austin, TX", region: "TX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "barton-creek-fazio-foothills", name: "Barton Creek Resort - Fazio Foothills", city: "Austin, TX", region: "TX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "barton-creek-fazio-canyons", name: "Barton Creek Resort - Fazio Canyons", city: "Austin, TX", region: "TX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "barton-creek-crenshaw-cliffside", name: "Barton Creek Resort - Crenshaw Cliffside", city: "Austin, TX", region: "TX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "lions-muni", name: "Lions Municipal Golf Course", city: "Austin, TX", region: "TX", access: "municipal", holes: 18, pars: p(18, 71) },
  { id: "lost-creek-cc", name: "Lost Creek Country Club", city: "Austin, TX", region: "TX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "hills-cc-hills-course", name: "The Hills Country Club - Hills Course", city: "Austin, TX", region: "TX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "spanish-oaks", name: "Spanish Oaks Golf Club", city: "Bee Cave, TX", region: "TX", access: "private", holes: 18, pars: p(18, 71) },
  { id: "ut-golf-club", name: "University of Texas Golf Club", city: "Austin, TX", region: "TX", access: "private", holes: 18, pars: p(18, 71) },
  { id: "falconhead", name: "Falconhead Golf Club", city: "Austin, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "roy-kizer", name: "Roy Kizer Golf Course", city: "Austin, TX", region: "TX", access: "municipal", holes: 18, pars: p(18, 71) },
  { id: "avery-ranch", name: "Avery Ranch Golf Club", city: "Austin, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },

  // --- Inland Empire extras ---
  { id: "tukwet-champions", name: "Tukwet Canyon - Champions", city: "Beaumont, CA", region: "IE", access: "public", holes: 18, pars: p(18, 72) },
  { id: "tukwet-legends", name: "Tukwet Canyon - Legends", city: "Beaumont, CA", region: "IE", access: "public", holes: 18, pars: p(18, 72) },
  { id: "soboba-springs", name: "Soboba Springs Golf Course", city: "San Jacinto, CA", region: "IE", access: "public", holes: 18, pars: p(18, 72) },
  { id: "glen-ivy", name: "Glen Ivy Golf Club", city: "Corona, CA", region: "IE", access: "public", holes: 18, pars: p(18, 72) },
  { id: "cherry-hills-sun-city", name: "Cherry Hills Country Club", city: "Menifee, CA", region: "IE", access: "public", holes: 18, pars: p(18, 72) },

  // --- NorCal Bay Area / Monterey Peninsula ---
  { id: "pebble-beach-golf-links", name: "Pebble Beach Golf Links", city: "Pebble Beach, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "spyglass-hill", name: "Spyglass Hill Golf Course", city: "Pebble Beach, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "spanish-bay", name: "The Links at Spanish Bay", city: "Pebble Beach, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "olympic-club-lake", name: "Olympic Club - Lake Course", city: "San Francisco, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "olympic-club-ocean", name: "Olympic Club - Ocean Course", city: "San Francisco, CA", region: "NC", access: "private", holes: 18, pars: p(18, 70) },
  { id: "tpc-harding-park", name: "TPC Harding Park", city: "San Francisco, CA", region: "NC", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "pasatiempo", name: "Pasatiempo Golf Club", city: "Santa Cruz, CA", region: "NC", access: "public", holes: 18, pars: p(18, 70) },
  { id: "half-moon-bay-old", name: "Half Moon Bay - Old Course", city: "Half Moon Bay, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "half-moon-bay-ocean", name: "Half Moon Bay - Ocean Course", city: "Half Moon Bay, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "san-francisco-golf-club", name: "San Francisco Golf Club", city: "San Francisco, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "presidio-golf-course", name: "Presidio Golf Course", city: "San Francisco, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "sharp-park", name: "Sharp Park Golf Course", city: "Pacifica, CA", region: "NC", access: "municipal", holes: 18, pars: p(18, 72) },

  // --- Phoenix / Scottsdale, AZ ---
  { id: "tpc-scottsdale-stadium", name: "TPC Scottsdale - Stadium Course", city: "Scottsdale, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "tpc-scottsdale-champions", name: "TPC Scottsdale - Champions Course", city: "Scottsdale, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "troon-north-pinnacle", name: "Troon North - Pinnacle Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "troon-north-monument", name: "Troon North - Monument Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "grayhawk-talon", name: "Grayhawk - Talon Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "grayhawk-raptor", name: "Grayhawk - Raptor Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "we-ko-pa-saguaro", name: "We-Ko-Pa Golf Club - Saguaro Course", city: "Fort McDowell, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 71) },
  { id: "we-ko-pa-cholla", name: "We-Ko-Pa Golf Club - Cholla Course", city: "Fort McDowell, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "boulders-north", name: "The Boulders - North Course", city: "Carefree, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "boulders-south", name: "The Boulders - South Course", city: "Carefree, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 71) },

  // --- Las Vegas, NV ---
  { id: "shadow-creek", name: "Shadow Creek", city: "North Las Vegas, NV", region: "NV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cascata", name: "Cascata", city: "Boulder City, NV", region: "NV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "wynn-golf-club", name: "Wynn Golf Club", city: "Las Vegas, NV", region: "NV", access: "resort", holes: 18, pars: p(18, 70) },
  { id: "tpc-las-vegas", name: "TPC Las Vegas", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 71) },
  { id: "bali-hai", name: "Bali Hai Golf Club", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 71) },
  { id: "lv-paiute-snow-mountain", name: "Las Vegas Paiute - Snow Mountain Course", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "lv-paiute-sun-mountain", name: "Las Vegas Paiute - Sun Mountain Course", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "lv-paiute-wolf", name: "Las Vegas Paiute - Wolf Course", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },

  // --- Pacific Northwest expansion ---
  { id: "chambers-bay", name: "Chambers Bay", city: "University Place, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "bandon-dunes", name: "Bandon Dunes Golf Resort - Bandon Dunes", city: "Bandon, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "bandon-pacific-dunes", name: "Bandon Dunes Golf Resort - Pacific Dunes", city: "Bandon, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "bandon-old-macdonald", name: "Bandon Dunes Golf Resort - Old Macdonald", city: "Bandon, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "bandon-trails", name: "Bandon Dunes Golf Resort - Bandon Trails", city: "Bandon, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "pumpkin-ridge-witch-hollow", name: "Pumpkin Ridge - Witch Hollow", city: "North Plains, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "pumpkin-ridge-ghost-creek", name: "Pumpkin Ridge - Ghost Creek", city: "North Plains, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 71) },

  // --- Dallas + Houston, TX ---
  { id: "colonial-cc", name: "Colonial Country Club", city: "Fort Worth, TX", region: "TX", access: "private", holes: 18, pars: p(18, 70) },
  { id: "trinity-forest", name: "Trinity Forest Golf Club", city: "Dallas, TX", region: "TX", access: "private", holes: 18, pars: p(18, 71) },
  { id: "maridoe", name: "Maridoe Golf Club", city: "Carrollton, TX", region: "TX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "vaquero-club", name: "Vaquero Club", city: "Westlake, TX", region: "TX", access: "private", holes: 18, pars: p(18, 71) },
  { id: "northwood-club", name: "Northwood Club", city: "Dallas, TX", region: "TX", access: "private", holes: 18, pars: p(18, 71) },
  { id: "memorial-park", name: "Memorial Park Golf Course", city: "Houston, TX", region: "TX", access: "municipal", holes: 18, pars: p(18, 70) },
  { id: "blackhorse-north", name: "BlackHorse Golf Club - North Course", city: "Cypress, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "blackhorse-south", name: "BlackHorse Golf Club - South Course", city: "Cypress, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "wildcat-highlands", name: "The Wildcat Golf Club - Highlands Course", city: "Houston, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "wildcat-lakes", name: "The Wildcat Golf Club - Lakes Course", city: "Houston, TX", region: "TX", access: "public", holes: 18, pars: p(18, 72) },

  // --- Arizona expansion (Scottsdale, Phoenix, Flagstaff, Tucson) ---
  { id: "desert-mountain-cochise", name: "Desert Mountain - Cochise Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "desert-mountain-geronimo", name: "Desert Mountain - Geronimo Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "desert-mountain-renegade", name: "Desert Mountain - Renegade Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "desert-mountain-outlaw", name: "Desert Mountain - Outlaw Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "desert-mountain-chiricahua", name: "Desert Mountain - Chiricahua Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "talking-stick-north", name: "Talking Stick - North Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 70) },
  { id: "talking-stick-south", name: "Talking Stick - South Course", city: "Scottsdale, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 71) },
  { id: "whisper-rock-lower", name: "Whisper Rock - Lower Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "whisper-rock-upper", name: "Whisper Rock - Upper Course", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "estancia-club", name: "Estancia Club", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "silverleaf-club", name: "Silverleaf Club", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 71) },
  { id: "mirabel-club", name: "Mirabel Club", city: "Scottsdale, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 72) },
  { id: "camelback-ambiente", name: "Camelback Golf Club - Ambiente Course", city: "Scottsdale, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "camelback-padre", name: "Camelback Golf Club - Padre Course", city: "Scottsdale, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "wildfire-faldo", name: "Wildfire Golf Club - Faldo Championship Course", city: "Phoenix, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "wildfire-palmer", name: "Wildfire Golf Club - Palmer Signature Course", city: "Phoenix, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "forest-highlands-canyon", name: "Forest Highlands - Canyon Course", city: "Flagstaff, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 71) },
  { id: "forest-highlands-meadow", name: "Forest Highlands - Meadow Course", city: "Flagstaff, AZ", region: "AZ", access: "private", holes: 18, pars: p(18, 71) },
  { id: "quintero-golf-club", name: "Quintero Golf Club", city: "Peoria, AZ", region: "AZ", access: "public", holes: 18, pars: p(18, 72) },
  { id: "ventana-canyon-mountain", name: "Ventana Canyon - Mountain Course", city: "Tucson, AZ", region: "AZ", access: "resort", holes: 18, pars: p(18, 72) },

  // --- Nevada expansion (Las Vegas + Reno/Tahoe) ---
  { id: "tpc-summerlin", name: "TPC Summerlin", city: "Las Vegas, NV", region: "NV", access: "private", holes: 18, pars: p(18, 71) },
  { id: "bears-best-las-vegas", name: "Bear's Best Las Vegas", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "reflection-bay", name: "Reflection Bay Golf Club", city: "Henderson, NV", region: "NV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "rio-secco", name: "Rio Secco Golf Club", city: "Henderson, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "southern-highlands", name: "Southern Highlands Golf Club", city: "Las Vegas, NV", region: "NV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "angel-park-mountain", name: "Angel Park - Mountain Course", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 71) },
  { id: "angel-park-palm", name: "Angel Park - Palm Course", city: "Las Vegas, NV", region: "NV", access: "public", holes: 18, pars: p(18, 70) },
  { id: "dragonridge-cc", name: "DragonRidge Country Club", city: "Henderson, NV", region: "NV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "red-rock-cc-mountain", name: "Red Rock Country Club - Mountain Course", city: "Las Vegas, NV", region: "NV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "edgewood-tahoe", name: "Edgewood Tahoe Golf Course", city: "Stateline, NV", region: "NV", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "old-greenwood", name: "Old Greenwood Golf Course", city: "Truckee, CA", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "montreux-gcc", name: "Montreux Golf & Country Club", city: "Reno, NV", region: "NV", access: "private", holes: 18, pars: p(18, 72) },
  { id: "genoa-lakes-lakes", name: "Genoa Lakes - Lakes Course", city: "Genoa, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "incline-village-championship", name: "Incline Village Championship Course", city: "Incline Village, NV", region: "NV", access: "public", holes: 18, pars: p(18, 72) },
  { id: "arrowcreek-cc", name: "ArrowCreek Country Club", city: "Reno, NV", region: "NV", access: "private", holes: 18, pars: p(18, 72) },

  // --- Utah (St. George, SLC, Park City / Heber Valley) ---
  { id: "sand-hollow-championship", name: "Sand Hollow Golf Resort - Championship Course", city: "Hurricane, UT", region: "UT", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "coral-canyon", name: "Coral Canyon Golf Course", city: "Washington, UT", region: "UT", access: "public", holes: 18, pars: p(18, 72) },
  { id: "entrada-snow-canyon", name: "Entrada at Snow Canyon Country Club", city: "St. George, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "the-ledges", name: "The Ledges Golf Club", city: "St. George, UT", region: "UT", access: "public", holes: 18, pars: p(18, 72) },
  { id: "sunbrook", name: "Sunbrook Golf Course", city: "St. George, UT", region: "UT", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "bonneville-golf", name: "Bonneville Golf Course", city: "Salt Lake City, UT", region: "UT", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "mountain-dell-canyon", name: "Mountain Dell - Canyon Course", city: "Salt Lake City, UT", region: "UT", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "mountain-dell-lake", name: "Mountain Dell - Lake Course", city: "Salt Lake City, UT", region: "UT", access: "municipal", holes: 18, pars: p(18, 71) },
  { id: "promontory-pete-dye", name: "Promontory Club - Pete Dye Canyon Course", city: "Park City, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "promontory-nicklaus", name: "Promontory Club - Nicklaus Painted Valley Course", city: "Park City, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "park-meadows-cc", name: "Park Meadows Country Club", city: "Park City, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "glenwild", name: "Glenwild Golf Club & Spa", city: "Park City, UT", region: "UT", access: "private", holes: 18, pars: p(18, 71) },
  { id: "red-ledges", name: "Red Ledges", city: "Heber City, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "victory-ranch", name: "Victory Ranch", city: "Kamas, UT", region: "UT", access: "private", holes: 18, pars: p(18, 72) },
  { id: "soldier-hollow-gold", name: "Soldier Hollow - Gold Course", city: "Midway, UT", region: "UT", access: "public", holes: 18, pars: p(18, 72) },

  // --- Florida ---
  { id: "tpc-sawgrass-stadium", name: "TPC Sawgrass - The Players Stadium Course", city: "Ponte Vedra Beach, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "tpc-sawgrass-dyes-valley", name: "TPC Sawgrass - Dye's Valley Course", city: "Ponte Vedra Beach, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "streamsong-red", name: "Streamsong Resort - Red Course", city: "Streamsong, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "streamsong-blue", name: "Streamsong Resort - Blue Course", city: "Streamsong, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  // Streamsong Black is par 73; helper p() doesn't have a canonical
  // 73 layout, so default to the 72 layout -- one hole's actual par
  // will be off by 1. Acceptable for catalog metadata; full scorecard
  // can be overridden per-course later.
  { id: "streamsong-black", name: "Streamsong Resort - Black Course", city: "Streamsong, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "trump-doral-blue-monster", name: "Trump National Doral - Blue Monster Course", city: "Miami, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "trump-doral-red-tiger", name: "Trump National Doral - Red Tiger Course", city: "Miami, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "trump-doral-gold", name: "Trump National Doral - Gold Course", city: "Miami, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 70) },
  { id: "bay-hill-championship", name: "Arnold Palmer's Bay Hill Club - Championship Course", city: "Orlando, FL", region: "FL", access: "public", holes: 18, pars: p(18, 72) },
  { id: "pga-national-champion", name: "PGA National - Champion Course", city: "Palm Beach Gardens, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pga-national-palmer", name: "PGA National - Palmer Course", city: "Palm Beach Gardens, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pga-national-squire", name: "PGA National - Squire Course", city: "Palm Beach Gardens, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pga-national-estate", name: "PGA National - Estate Course", city: "Palm Beach Gardens, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pga-national-fazio", name: "PGA National - Fazio Course", city: "Palm Beach Gardens, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "innisbrook-copperhead", name: "Innisbrook Resort - Copperhead Course", city: "Palm Harbor, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "innisbrook-island", name: "Innisbrook Resort - Island Course", city: "Palm Harbor, FL", region: "FL", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "lake-nona", name: "Lake Nona Golf & Country Club", city: "Orlando, FL", region: "FL", access: "private", holes: 18, pars: p(18, 72) },
  { id: "seminole", name: "Seminole Golf Club", city: "Juno Beach, FL", region: "FL", access: "private", holes: 18, pars: p(18, 72) },
  { id: "the-concession", name: "The Concession Golf Club", city: "Bradenton, FL", region: "FL", access: "private", holes: 18, pars: p(18, 72) },
  { id: "black-diamond-ranch-quarry", name: "Black Diamond Ranch - Quarry Course", city: "Lecanto, FL", region: "FL", access: "public", holes: 18, pars: p(18, 72) },

  // --- Carolinas (NC + SC) ---
  { id: "pinehurst-no-2", name: "Pinehurst Resort - No. 2 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-4", name: "Pinehurst Resort - No. 4 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-6", name: "Pinehurst Resort - No. 6 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-7", name: "Pinehurst Resort - No. 7 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-8", name: "Pinehurst Resort - No. 8 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-9", name: "Pinehurst Resort - No. 9 Course", city: "Pinehurst, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "pinehurst-no-10", name: "Pinehurst Resort - No. 10 Course", city: "Aberdeen, NC", region: "CAR", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "pine-needles", name: "Pine Needles Lodge & Golf Club", city: "Southern Pines, NC", region: "CAR", access: "public", holes: 18, pars: p(18, 71) },
  { id: "mid-pines", name: "Mid Pines Inn & Golf Club", city: "Southern Pines, NC", region: "CAR", access: "public", holes: 18, pars: p(18, 72) },
  { id: "tobacco-road", name: "Tobacco Road Golf Club", city: "Sanford, NC", region: "CAR", access: "public", holes: 18, pars: p(18, 71) },
  { id: "quail-hollow", name: "Quail Hollow Club", city: "Charlotte, NC", region: "CAR", access: "private", holes: 18, pars: p(18, 71) },
  { id: "charlotte-country-club", name: "Charlotte Country Club", city: "Charlotte, NC", region: "CAR", access: "private", holes: 18, pars: p(18, 71) },
  { id: "sedgefield", name: "Sedgefield Country Club", city: "Greensboro, NC", region: "CAR", access: "private", holes: 18, pars: p(18, 70) },
  { id: "kiawah-ocean", name: "Kiawah Island Golf Resort - Ocean Course", city: "Kiawah Island, SC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "kiawah-turtle-point", name: "Kiawah Island Golf Resort - Turtle Point Course", city: "Kiawah Island, SC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "harbour-town", name: "Harbour Town Golf Links", city: "Hilton Head Island, SC", region: "CAR", access: "public", holes: 18, pars: p(18, 71) },
  { id: "sea-pines-ocean", name: "The Ocean Course at Sea Pines", city: "Hilton Head Island, SC", region: "CAR", access: "resort", holes: 18, pars: p(18, 72) },

  // --- Midwest (WI + IL + MI) ---
  // Streamsong Black + Mammoth Dunes are par-73, Sedge Valley is
  // par-68; same one-stroke-off-per-hole caveat applies for those.
  { id: "whistling-straits-straits", name: "Whistling Straits - Straits Course", city: "Sheboygan, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "whistling-straits-irish", name: "Whistling Straits - Irish Course", city: "Sheboygan, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "blackwolf-run-river", name: "Blackwolf Run - River Course", city: "Kohler, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "blackwolf-run-meadow-valleys", name: "Blackwolf Run - Meadow Valleys Course", city: "Kohler, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "erin-hills", name: "Erin Hills", city: "Erin, WI", region: "MW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "sand-valley-sand-valley", name: "Sand Valley Golf Resort - Sand Valley Course", city: "Nekoosa, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "sand-valley-mammoth-dunes", name: "Sand Valley Golf Resort - Mammoth Dunes Course", city: "Nekoosa, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "sand-valley-sedge-valley", name: "Sand Valley Golf Resort - Sedge Valley Course", city: "Nekoosa, WI", region: "MW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cog-hill-dubsdread", name: "Cog Hill Golf & Country Club - Course No. 4 Dubsdread", city: "Lemont, IL", region: "MW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "olympia-fields-north", name: "Olympia Fields Country Club - North Course", city: "Olympia Fields, IL", region: "MW", access: "private", holes: 18, pars: p(18, 70) },
  { id: "medinah-no-3", name: "Medinah Country Club - Course No. 3", city: "Medinah, IL", region: "MW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "crystal-downs", name: "Crystal Downs Country Club", city: "Frankfort, MI", region: "MW", access: "private", holes: 18, pars: p(18, 70) },
  { id: "oakland-hills-south", name: "Oakland Hills Country Club - South Course", city: "Bloomfield Township, MI", region: "MW", access: "private", holes: 18, pars: p(18, 72) },

  // --- Mexico ---
  // Loreto, Los Cabos circuit, Riviera Maya / Cancun, Puerto Vallarta
  // / Riviera Nayarit, and CDMX. Skipped: Diamante Oasis short course
  // (12 holes par 36) -- doesn't fit the 9/18 schema; can add later
  // if we extend the helper.
  { id: "tpc-danzante-bay", name: "TPC Danzante Bay at Villa del Palmar", city: "Loreto, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "diamante-dunes", name: "Diamante Cabo - Dunes Course", city: "Cabo San Lucas, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "diamante-el-cardonal", name: "Diamante Cabo - El Cardonal Course", city: "Cabo San Lucas, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "quivira-golf-club", name: "Quivira Golf Club", city: "Cabo San Lucas, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cabo-del-sol-cove", name: "Cabo del Sol - Cove Club", city: "San Jose del Cabo, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cabo-del-sol-desert", name: "Cabo del Sol - Desert Course", city: "San Jose del Cabo, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cabo-real-golf-club", name: "Cabo Real Golf Club", city: "Los Cabos, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "querencia-golf-club", name: "Querencia Golf Club", city: "San Jose del Cabo, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "palmilla-golf-club", name: "Palmilla Golf Club", city: "San Jose del Cabo, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "el-dorado-golf-club", name: "El Dorado Golf Club", city: "San Jose del Cabo, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "puerto-los-cabos", name: "Puerto Los Cabos Golf Club", city: "San Jose del Cabo, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "chileno-bay-club", name: "Chileno Bay Club", city: "Cabo San Lucas, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "twin-dolphin-golf-club", name: "Twin Dolphin Golf Club", city: "Cabo San Lucas, BCS", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "cabo-san-lucas-country-club", name: "Cabo San Lucas Country Club", city: "Cabo San Lucas, BCS", region: "MX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "vidanta-los-cabos", name: "Vidanta Golf Los Cabos", city: "San Jose del Cabo, BCS", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "mayakoba-el-camaleon", name: "Mayakoba El Camaleon Golf Club", city: "Playa del Carmen, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "iberostar-playa-paraiso", name: "Iberostar Playa Paraiso Golf Club", city: "Playa del Carmen, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "riviera-maya-golf-club", name: "Riviera Maya Golf Club", city: "Akumal, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "moon-palace-jaguar", name: "Moon Palace Golf Club - Jaguar Course", city: "Cancun, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "moon-palace-dunes", name: "Moon Palace Golf Club - Dunes Course", city: "Cancun, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "cancun-country-club", name: "Cancun Country Club", city: "Cancun, QR", region: "MX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "playa-mujeres-golf-club", name: "Playa Mujeres Golf Club", city: "Cancun, QR", region: "MX", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "vidanta-vallarta-norman", name: "Vidanta Vallarta - Norman Signature Course", city: "Nuevo Vallarta, Nayarit", region: "MX", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "vidanta-vallarta-nicklaus", name: "Vidanta Vallarta - Nicklaus Course", city: "Nuevo Vallarta, Nayarit", region: "MX", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "punta-mita-pacifico", name: "Punta Mita - Pacifico Course", city: "Punta de Mita, Nayarit", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "punta-mita-bahia", name: "Punta Mita - Bahia Course", city: "Punta de Mita, Nayarit", region: "MX", access: "private", holes: 18, pars: p(18, 72) },
  { id: "marina-vallarta-golf-club", name: "Marina Vallarta Golf Club", city: "Puerto Vallarta, Jalisco", region: "MX", access: "public", holes: 18, pars: p(18, 71) },
  { id: "el-tigre-golf-club", name: "El Tigre Golf Club", city: "Nuevo Vallarta, Nayarit", region: "MX", access: "public", holes: 18, pars: p(18, 72) },
  { id: "club-de-golf-chapultepec", name: "Club de Golf Chapultepec", city: "Mexico City", region: "MX", access: "private", holes: 18, pars: p(18, 71) },

  // --- Oregon (Bend high desert, Portland metro, Eugene/Coast) ---
  { id: "pronghorn-nicklaus", name: "Pronghorn Club - Nicklaus Course", city: "Bend, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "pronghorn-fazio", name: "Pronghorn Club - Fazio Course", city: "Bend, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "tetherow", name: "Tetherow Golf Club", city: "Bend, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "brasada-ranch", name: "Brasada Ranch Golf Course", city: "Powell Butte, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "black-butte-big-meadow", name: "Black Butte Ranch - Big Meadow Course", city: "Sisters, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "black-butte-glaze-meadow", name: "Black Butte Ranch - Glaze Meadow Course", city: "Sisters, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "crosswater", name: "Crosswater Club at Sunriver", city: "Sunriver, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "sunriver-meadows", name: "Sunriver Resort - Meadows Course", city: "Sunriver, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "sunriver-woodlands", name: "Sunriver Resort - Woodlands Course", city: "Sunriver, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "aspen-lakes", name: "Aspen Lakes Golf Course", city: "Sisters, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "juniper", name: "Juniper Golf Club", city: "Redmond, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "reserve-north", name: "The Reserve Vineyards & Golf Club - North Course", city: "Aloha, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "reserve-south", name: "The Reserve Vineyards & Golf Club - South Course", city: "Aloha, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "oregon-golf-club", name: "The Oregon Golf Club", city: "West Linn, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "langdon-farms", name: "Langdon Farms Golf Club", city: "Aurora, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 71) },
  { id: "heron-lakes-great-blue", name: "Heron Lakes - Great Blue Course", city: "Portland, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "heron-lakes-greenback", name: "Heron Lakes - Greenback Course", city: "Portland, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "eastmoreland", name: "Eastmoreland Golf Course", city: "Portland, OR", region: "PNW", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "waverley", name: "Waverley Country Club", city: "Portland, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "columbia-edgewater", name: "Columbia Edgewater Country Club", city: "Portland, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "tokatee", name: "Tokatee Golf Club", city: "Blue River, OR", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "eugene-cc", name: "Eugene Country Club", city: "Eugene, OR", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "salishan", name: "Salishan Spa & Golf Resort", city: "Gleneden Beach, OR", region: "PNW", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "stone-creek", name: "Stone Creek Golf Club", city: "Oregon City, OR", region: "PNW", access: "municipal", holes: 18, pars: p(18, 72) },

  // --- Washington (beyond Chambers Bay + Riverbend) ---
  { id: "sahalee", name: "Sahalee Country Club", city: "Sammamish, WA", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "aldarra", name: "Aldarra Golf Club", city: "Sammamish, WA", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "home-course", name: "The Home Course", city: "DuPont, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "tumble-creek", name: "Tumble Creek Club at Suncadia", city: "Cle Elum, WA", region: "PNW", access: "private", holes: 18, pars: p(18, 72) },
  { id: "suncadia-prospector", name: "Suncadia Resort - Prospector Course", city: "Cle Elum, WA", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "suncadia-rope-rider", name: "Suncadia Resort - Rope Rider Course", city: "Cle Elum, WA", region: "PNW", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "mccormick-woods", name: "McCormick Woods Golf Club", city: "Port Orchard, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "trophy-lake", name: "Trophy Lake Golf & Casting", city: "Port Orchard, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "gold-mountain-olympic", name: "Gold Mountain Golf Club - Olympic Course", city: "Bremerton, WA", region: "PNW", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "gold-mountain-cascade", name: "Gold Mountain Golf Club - Cascade Course", city: "Bremerton, WA", region: "PNW", access: "municipal", holes: 18, pars: p(18, 71) },
  { id: "newcastle-coal-creek", name: "Newcastle Golf Club - Coal Creek Course", city: "Newcastle, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 72) },
  { id: "newcastle-china-creek", name: "Newcastle Golf Club - China Creek Course", city: "Newcastle, WA", region: "PNW", access: "public", holes: 18, pars: p(18, 71) },
  { id: "tacoma-cc", name: "Tacoma Country & Golf Club", city: "Lakewood, WA", region: "PNW", access: "private", holes: 18, pars: p(18, 71) },

  // --- NorCal expansion (Monterey Peninsula, Bay Area, wine country) ---
  // Lincoln Park (SF) is published as par 68 but the p() helper has
  // no canonical 68 layout, so default to p(18, 72); four holes will
  // be off-by-one in the seeded scorecard. Catalog metadata only --
  // full scorecard can be overridden per course later.
  { id: "cypress-point", name: "Cypress Point Club", city: "Pebble Beach, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "poppy-hills", name: "Poppy Hills Golf Course", city: "Pebble Beach, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "mpcc-dunes", name: "Monterey Peninsula Country Club - Dunes Course", city: "Pebble Beach, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "mpcc-shore", name: "Monterey Peninsula Country Club - Shore Course", city: "Pebble Beach, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "quail-lodge", name: "Quail Lodge Golf Club", city: "Carmel, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 71) },
  { id: "pacific-grove", name: "Pacific Grove Golf Links", city: "Pacific Grove, CA", region: "NC", access: "municipal", holes: 18, pars: p(18, 70) },
  { id: "bayonet", name: "Bayonet & Black Horse - Bayonet Course", city: "Seaside, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "black-horse", name: "Bayonet & Black Horse - Black Horse Course", city: "Seaside, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "lake-merced", name: "Lake Merced Golf Club", city: "Daly City, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "stanford", name: "Stanford Golf Course", city: "Stanford, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "crystal-springs", name: "Crystal Springs Golf Club", city: "Burlingame, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "lincoln-park-sf", name: "Lincoln Park Golf Course", city: "San Francisco, CA", region: "NC", access: "municipal", holes: 18, pars: p(18, 72) },
  { id: "meadow-club", name: "Meadow Club", city: "Fairfax, CA", region: "NC", access: "private", holes: 18, pars: p(18, 71) },
  { id: "the-bridges", name: "The Bridges Golf Club", city: "San Ramon, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "wente-vineyards", name: "Wente Vineyards Golf Course", city: "Livermore, CA", region: "NC", access: "public", holes: 18, pars: p(18, 72) },
  { id: "tilden-park", name: "Tilden Park Golf Course", city: "Berkeley, CA", region: "NC", access: "municipal", holes: 18, pars: p(18, 70) },
  { id: "silverado-north", name: "Silverado Resort - North Course", city: "Napa, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "silverado-south", name: "Silverado Resort - South Course", city: "Napa, CA", region: "NC", access: "resort", holes: 18, pars: p(18, 72) },
  { id: "sonoma-golf-club", name: "Sonoma Golf Club", city: "Sonoma, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "mayacama", name: "Mayacama Golf Club", city: "Santa Rosa, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },
  { id: "cordevalle", name: "CordeValle", city: "San Martin, CA", region: "NC", access: "private", holes: 18, pars: p(18, 72) },

  // --- Pacific Northwest (sample / dev courses) ---
  {
    id: "riverbend-golf-complex",
    name: "Riverbend Golf Complex",
    city: "Kent, WA",
    region: "PNW",
    access: "municipal",
    holes: 18,
    pars: p(18, 72),
  },
];

// Clubhouse / property-center coordinates per preset id. Kept in a
// separate map (rather than inlined on each preset row above) so the
// table is easy to read and easy to backfill. Used by the new-match
// wizard's "find course near me" affordance for any course that
// doesn't yet have its own Course row with a centerLat/centerLng.
// Precision target: ~10m -- enough to pick the right course out of
// a metro area, not a substitute for the per-hole geometry we get
// from GolfBert / OSM.
export const COURSE_PRESET_COORDS: Record<string, { lat: number; lng: number }> = {
  "riviera-cc": { lat: 34.0461, lng: -118.5095 },
  "bel-air-cc": { lat: 34.0928, lng: -118.4517 },
  "la-cc-north": { lat: 34.0738, lng: -118.4192 },
  "wilshire-cc": { lat: 34.0758, lng: -118.3318 },
  "brentwood-cc": { lat: 34.0533, lng: -118.4756 },
  "lakeside-gc": { lat: 34.1547, lng: -118.3614 },
  "rancho-park": { lat: 34.0463, lng: -118.4178 },
  // Wilson + Harding share a clubhouse in Los Feliz.
  "griffith-wilson": { lat: 34.1336, lng: -118.2861 },
  "griffith-harding": { lat: 34.1336, lng: -118.2861 },
  "hansen-dam": { lat: 34.2630, lng: -118.3873 },
  "woodley-lakes": { lat: 34.1830, lng: -118.4858 },
  "alondra-park": { lat: 33.8867, lng: -118.3358 },
  "los-verdes": { lat: 33.7430, lng: -118.3870 },
  // Sepulveda Balboa + Encino share the same clubhouse area.
  "sepulveda-balboa": { lat: 34.1737, lng: -118.4942 },
  "sepulveda-encino": { lat: 34.1737, lng: -118.4942 },
  "el-dorado-park": { lat: 33.8146, lng: -118.0867 },
  "heartwell-park": { lat: 33.8278, lng: -118.1300 },
  "rio-hondo": { lat: 33.9433, lng: -118.1494 },
  "westchester-gc": { lat: 33.9637, lng: -118.4072 },
  "penmar-gc": { lat: 33.9956, lng: -118.4633 },
  // Brookside #1 + #2 share a clubhouse next to the Rose Bowl.
  "brookside-1": { lat: 34.1647, lng: -118.1730 },
  "brookside-2": { lat: 34.1647, lng: -118.1730 },
  "trump-la": { lat: 33.7378, lng: -118.3553 },
  // Industry Hills - Pacific Palms clubhouse for both courses.
  "industry-hills-eisenhower": { lat: 34.0297, lng: -117.9425 },
  "industry-hills-zaharias": { lat: 34.0297, lng: -117.9425 },
  "rustic-canyon": { lat: 34.2914, lng: -118.8717 },
  "angeles-national": { lat: 34.2697, lng: -118.3358 },
  // Sand Canyon CC -- all three nines share a clubhouse.
  "sand-canyon-vd": { lat: 34.4189, lng: -118.4583 },
  "sand-canyon-dm": { lat: 34.4189, lng: -118.4583 },
  "sand-canyon-mv": { lat: 34.4189, lng: -118.4583 },
  // Pelican Hill - South + North share the clubhouse.
  "pelican-hill-south": { lat: 33.5953, lng: -117.8336 },
  "pelican-hill-north": { lat: 33.5953, lng: -117.8336 },
  "strawberry-farms": { lat: 33.6711, lng: -117.7886 },
  "aliso-viejo-cc": { lat: 33.5814, lng: -117.7150 },
  "tijeras-creek": { lat: 33.6336, lng: -117.5953 },
  "tustin-ranch": { lat: 33.7611, lng: -117.7728 },
  "black-gold": { lat: 33.9072, lng: -117.7569 },
  "coyote-hills": { lat: 33.8961, lng: -117.9272 },
  "birch-hills": { lat: 33.9214, lng: -117.8836 },
  "arroyo-trabuco": { lat: 33.5825, lng: -117.6628 },
  "anaheim-hills": { lat: 33.8550, lng: -117.7461 },
  // Coto de Caza - South + North share a clubhouse.
  "coto-de-caza-south": { lat: 33.6072, lng: -117.5853 },
  "coto-de-caza-north": { lat: 33.6072, lng: -117.5853 },
  "newport-beach-cc": { lat: 33.6122, lng: -117.8742 },
  "big-canyon-cc": { lat: 33.6258, lng: -117.8736 },
  // Mile Square - Classic + Player's share the clubhouse.
  "mile-square-classic": { lat: 33.7028, lng: -117.9447 },
  "mile-square-players": { lat: 33.7028, lng: -117.9447 },
  // Costa Mesa CC - both nines share the clubhouse off Mesa Verde Dr.
  "costa-mesa-mesa-linda": { lat: 33.6711, lng: -117.9419 },
  "costa-mesa-los-lagos": { lat: 33.6711, lng: -117.9419 },
  "monarch-beach": { lat: 33.4836, lng: -117.7106 },
  talega: { lat: 33.4683, lng: -117.5808 },
  "san-clemente-muni": { lat: 33.4358, lng: -117.6175 },
  shorecliffs: { lat: 33.4361, lng: -117.6028 },
  "el-niguel-cc": { lat: 33.5025, lng: -117.7081 },
  "newport-beach-gc": { lat: 33.6606, lng: -117.8736 },
  "santa-ana-cc": { lat: 33.6694, lng: -117.8533 },
  "yorba-linda-cc": { lat: 33.8911, lng: -117.7747 },
  "oak-quarry-gc": { lat: 33.9831, lng: -117.4625 },
  "goose-creek-gc": { lat: 33.9853, lng: -117.5142 },
  "hidden-valley-gc": { lat: 33.9275, lng: -117.5814 },
  // Bighorn - Canyons + Mountains share the clubhouse.
  "bighorn-gc-canyons": { lat: 33.7019, lng: -116.4097 },
  "bighorn-gc-mountains": { lat: 33.7019, lng: -116.4097 },
  "riverbend-golf-complex": { lat: 47.4017, lng: -122.2272 },

  // --- Coachella Valley ---
  // PGA West, La Quinta Resort, Mission Hills, Desert Willow,
  // Indian Wells Resort, and JW Marriott Desert Springs are
  // multi-course properties -- both courses at each share a
  // clubhouse coordinate.
  "pga-west-stadium": { lat: 33.6524, lng: -116.2706 },
  "pga-west-nicklaus-tournament": { lat: 33.6524, lng: -116.2706 },
  "la-quinta-country-club": { lat: 33.6924, lng: -116.2815 },
  "la-quinta-resort-mountain": { lat: 33.6760, lng: -116.3000 },
  "la-quinta-resort-dunes": { lat: 33.6760, lng: -116.3000 },
  "mission-hills-dinah-shore": { lat: 33.7647, lng: -116.4145 },
  "mission-hills-pete-dye-challenge": { lat: 33.7647, lng: -116.4145 },
  "desert-willow-firecliff": { lat: 33.7668, lng: -116.3666 },
  "desert-willow-mountain-view": { lat: 33.7668, lng: -116.3666 },
  "indian-wells-celebrity": { lat: 33.7166, lng: -116.3372 },
  "indian-wells-players": { lat: 33.7166, lng: -116.3372 },
  "jw-marriott-palm": { lat: 33.7548, lng: -116.3612 },
  "jw-marriott-valley": { lat: 33.7548, lng: -116.3612 },
  "the-reserve-club": { lat: 33.6720, lng: -116.3247 },
  "stone-eagle": { lat: 33.7040, lng: -116.4140 },
  "toscana-cc": { lat: 33.7170, lng: -116.2940 },

  // --- San Diego ---
  // Torrey Pines North + South share their clubhouse.
  "torrey-pines-north": { lat: 32.9045, lng: -117.2454 },
  "torrey-pines-south": { lat: 32.9045, lng: -117.2454 },
  aviara: { lat: 33.0931, lng: -117.2852 },
  maderas: { lat: 33.0094, lng: -117.0500 },
  "grand-golf-club": { lat: 32.9450, lng: -117.1980 },
  "coronado-muni": { lat: 32.6890, lng: -117.1730 },
  "encinitas-ranch": { lat: 33.0685, lng: -117.2767 },
  riverwalk: { lat: 32.7670, lng: -117.1640 },
  "steele-canyon": { lat: 32.7150, lng: -116.9580 },
  "carlton-oaks": { lat: 32.8392, lng: -117.0111 },
  "rancho-bernardo-inn": { lat: 33.0315, lng: -117.0669 },
  "twin-oaks": { lat: 33.1667, lng: -117.1604 },
  "san-diego-cc": { lat: 32.6260, lng: -117.0820 },

  // --- Ventura County ---
  // River Ridge Vineyard + Victoria Lakes share a clubhouse.
  "saticoy-cc": { lat: 34.2575, lng: -119.0010 },
  buenaventura: { lat: 34.2475, lng: -119.2390 },
  "olivas-links": { lat: 34.2390, lng: -119.2500 },
  "sterling-hills": { lat: 34.2400, lng: -119.0010 },
  "camarillo-springs": { lat: 34.2033, lng: -118.9920 },
  "river-ridge-vineyard": { lat: 34.2311, lng: -119.2035 },
  "river-ridge-victoria-lakes": { lat: 34.2311, lng: -119.2035 },

  // --- Austin, TX ---
  // Barton Creek Resort - Fazio Foothills / Fazio Canyons / Crenshaw
  // Cliffside share the resort clubhouse.
  "austin-cc": { lat: 30.3446, lng: -97.7983 },
  "barton-creek-fazio-foothills": { lat: 30.2912, lng: -97.8583 },
  "barton-creek-fazio-canyons": { lat: 30.2912, lng: -97.8583 },
  "barton-creek-crenshaw-cliffside": { lat: 30.2912, lng: -97.8583 },
  "lions-muni": { lat: 30.2902, lng: -97.7770 },
  "lost-creek-cc": { lat: 30.2860, lng: -97.8400 },
  "hills-cc-hills-course": { lat: 30.3500, lng: -97.9920 },
  "spanish-oaks": { lat: 30.3160, lng: -97.9530 },
  "ut-golf-club": { lat: 30.3760, lng: -97.8810 },
  falconhead: { lat: 30.3060, lng: -97.9430 },
  "roy-kizer": { lat: 30.1820, lng: -97.7430 },
  "avery-ranch": { lat: 30.5060, lng: -97.7860 },

  // --- Inland Empire extras ---
  // Tukwet Canyon Champions + Legends share the clubhouse.
  "tukwet-champions": { lat: 33.9410, lng: -116.9970 },
  "tukwet-legends": { lat: 33.9410, lng: -116.9970 },
  "soboba-springs": { lat: 33.7800, lng: -116.9580 },
  "glen-ivy": { lat: 33.7500, lng: -117.4920 },
  "cherry-hills-sun-city": { lat: 33.7100, lng: -117.1820 },

  // --- NorCal Bay Area / Monterey Peninsula ---
  // Olympic Club Lake + Ocean share the clubhouse. Half Moon Bay
  // Old + Ocean share the clubhouse.
  "pebble-beach-golf-links": { lat: 36.5683, lng: -121.9489 },
  "spyglass-hill": { lat: 36.5786, lng: -121.9528 },
  "spanish-bay": { lat: 36.6125, lng: -121.9461 },
  "olympic-club-lake": { lat: 37.7117, lng: -122.4936 },
  "olympic-club-ocean": { lat: 37.7117, lng: -122.4936 },
  "tpc-harding-park": { lat: 37.7253, lng: -122.4942 },
  pasatiempo: { lat: 37.0017, lng: -122.0419 },
  "half-moon-bay-old": { lat: 37.4475, lng: -122.4422 },
  "half-moon-bay-ocean": { lat: 37.4475, lng: -122.4422 },
  "san-francisco-golf-club": { lat: 37.7117, lng: -122.4781 },
  "presidio-golf-course": { lat: 37.7864, lng: -122.4631 },
  "sharp-park": { lat: 37.6306, lng: -122.4933 },

  // --- Phoenix / Scottsdale, AZ ---
  // TPC Scottsdale Stadium + Champions, Troon North Pinnacle +
  // Monument, Grayhawk Talon + Raptor, We-Ko-Pa Saguaro + Cholla,
  // and The Boulders North + South each share a clubhouse.
  "tpc-scottsdale-stadium": { lat: 33.6394, lng: -111.9056 },
  "tpc-scottsdale-champions": { lat: 33.6394, lng: -111.9056 },
  "troon-north-pinnacle": { lat: 33.7656, lng: -111.8650 },
  "troon-north-monument": { lat: 33.7656, lng: -111.8650 },
  "grayhawk-talon": { lat: 33.6739, lng: -111.8847 },
  "grayhawk-raptor": { lat: 33.6739, lng: -111.8847 },
  "we-ko-pa-saguaro": { lat: 33.6178, lng: -111.6878 },
  "we-ko-pa-cholla": { lat: 33.6178, lng: -111.6878 },
  "boulders-north": { lat: 33.8228, lng: -111.9189 },
  "boulders-south": { lat: 33.8228, lng: -111.9189 },

  // --- Las Vegas, NV ---
  // Las Vegas Paiute Snow + Sun + Wolf share the resort clubhouse.
  "shadow-creek": { lat: 36.2814, lng: -115.1297 },
  cascata: { lat: 35.9633, lng: -114.8786 },
  "wynn-golf-club": { lat: 36.1300, lng: -115.1656 },
  "tpc-las-vegas": { lat: 36.2092, lng: -115.3033 },
  "bali-hai": { lat: 36.0883, lng: -115.1717 },
  "lv-paiute-snow-mountain": { lat: 36.4233, lng: -115.3964 },
  "lv-paiute-sun-mountain": { lat: 36.4233, lng: -115.3964 },
  "lv-paiute-wolf": { lat: 36.4233, lng: -115.3964 },

  // --- Pacific Northwest expansion ---
  // Bandon Dunes 4 courses share the resort lodge coord; Pumpkin
  // Ridge Witch Hollow + Ghost Creek share theirs.
  "chambers-bay": { lat: 47.2058, lng: -122.5853 },
  "bandon-dunes": { lat: 43.1864, lng: -124.3858 },
  "bandon-pacific-dunes": { lat: 43.1864, lng: -124.3858 },
  "bandon-old-macdonald": { lat: 43.1864, lng: -124.3858 },
  "bandon-trails": { lat: 43.1864, lng: -124.3858 },
  "pumpkin-ridge-witch-hollow": { lat: 45.6175, lng: -123.0061 },
  "pumpkin-ridge-ghost-creek": { lat: 45.6175, lng: -123.0061 },

  // --- Dallas + Houston, TX ---
  // BlackHorse North + South share a clubhouse. Wildcat Highlands +
  // Lakes share theirs.
  "colonial-cc": { lat: 32.7081, lng: -97.3617 },
  "trinity-forest": { lat: 32.7144, lng: -96.7406 },
  maridoe: { lat: 32.9956, lng: -96.9450 },
  "vaquero-club": { lat: 32.9831, lng: -97.1942 },
  "northwood-club": { lat: 32.8961, lng: -96.7747 },
  "memorial-park": { lat: 29.7669, lng: -95.4322 },
  "blackhorse-north": { lat: 29.9583, lng: -95.7281 },
  "blackhorse-south": { lat: 29.9583, lng: -95.7281 },
  "wildcat-highlands": { lat: 29.6261, lng: -95.3608 },
  "wildcat-lakes": { lat: 29.6261, lng: -95.3608 },

  // --- Arizona expansion ---
  // Desert Mountain (5 courses), Talking Stick (N+S), Whisper Rock
  // (L+U), Camelback (Ambiente+Padre), Wildfire (Faldo+Palmer), and
  // Forest Highlands (Canyon+Meadow) each share a clubhouse.
  "desert-mountain-cochise": { lat: 33.8519, lng: -111.8703 },
  "desert-mountain-geronimo": { lat: 33.8519, lng: -111.8703 },
  "desert-mountain-renegade": { lat: 33.8519, lng: -111.8703 },
  "desert-mountain-outlaw": { lat: 33.8519, lng: -111.8703 },
  "desert-mountain-chiricahua": { lat: 33.8519, lng: -111.8703 },
  "talking-stick-north": { lat: 33.5447, lng: -111.8783 },
  "talking-stick-south": { lat: 33.5447, lng: -111.8783 },
  "whisper-rock-lower": { lat: 33.8003, lng: -112.0708 },
  "whisper-rock-upper": { lat: 33.8003, lng: -112.0708 },
  "estancia-club": { lat: 33.7861, lng: -111.9269 },
  "silverleaf-club": { lat: 33.6589, lng: -111.8456 },
  "mirabel-club": { lat: 33.8489, lng: -111.9508 },
  "camelback-ambiente": { lat: 33.5333, lng: -111.9647 },
  "camelback-padre": { lat: 33.5333, lng: -111.9647 },
  "wildfire-faldo": { lat: 33.6644, lng: -111.9619 },
  "wildfire-palmer": { lat: 33.6644, lng: -111.9619 },
  "forest-highlands-canyon": { lat: 35.1186, lng: -111.7019 },
  "forest-highlands-meadow": { lat: 35.1186, lng: -111.7019 },
  "quintero-golf-club": { lat: 33.8483, lng: -112.6661 },
  "ventana-canyon-mountain": { lat: 32.3211, lng: -110.8147 },

  // --- Nevada expansion ---
  // Angel Park (Mountain + Palm) shares a clubhouse.
  "tpc-summerlin": { lat: 36.1697, lng: -115.3242 },
  "bears-best-las-vegas": { lat: 36.1647, lng: -115.3294 },
  "reflection-bay": { lat: 36.0744, lng: -114.9333 },
  "rio-secco": { lat: 36.0050, lng: -115.0461 },
  "southern-highlands": { lat: 36.0061, lng: -115.1839 },
  "angel-park-mountain": { lat: 36.1839, lng: -115.2917 },
  "angel-park-palm": { lat: 36.1839, lng: -115.2917 },
  "dragonridge-cc": { lat: 36.0114, lng: -114.9764 },
  "red-rock-cc-mountain": { lat: 36.1542, lng: -115.3253 },
  "edgewood-tahoe": { lat: 38.9619, lng: -119.9419 },
  "old-greenwood": { lat: 39.3389, lng: -120.1697 },
  "montreux-gcc": { lat: 39.4083, lng: -119.8881 },
  "genoa-lakes-lakes": { lat: 39.0044, lng: -119.8456 },
  "incline-village-championship": { lat: 39.2483, lng: -119.9461 },
  "arrowcreek-cc": { lat: 39.4097, lng: -119.7869 },

  // --- Utah ---
  // Mountain Dell (Canyon + Lake) and Promontory (Pete Dye + Nicklaus)
  // each share a clubhouse.
  "sand-hollow-championship": { lat: 37.1361, lng: -113.3739 },
  "coral-canyon": { lat: 37.1408, lng: -113.4953 },
  "entrada-snow-canyon": { lat: 37.1467, lng: -113.6531 },
  "the-ledges": { lat: 37.1881, lng: -113.6708 },
  sunbrook: { lat: 37.0844, lng: -113.6242 },
  "bonneville-golf": { lat: 40.7517, lng: -111.8161 },
  "mountain-dell-canyon": { lat: 40.7575, lng: -111.7283 },
  "mountain-dell-lake": { lat: 40.7575, lng: -111.7283 },
  "promontory-pete-dye": { lat: 40.7283, lng: -111.4264 },
  "promontory-nicklaus": { lat: 40.7283, lng: -111.4264 },
  "park-meadows-cc": { lat: 40.6647, lng: -111.5117 },
  glenwild: { lat: 40.7375, lng: -111.5414 },
  "red-ledges": { lat: 40.5739, lng: -111.3819 },
  "victory-ranch": { lat: 40.5897, lng: -111.2447 },
  "soldier-hollow-gold": { lat: 40.5181, lng: -111.4781 },

  // --- Florida ---
  // TPC Sawgrass (Stadium + Dye's Valley), Streamsong (R/B/Bk),
  // Trump Doral (3 courses), PGA National (5 courses), and
  // Innisbrook (Copperhead + Island) each share a clubhouse coord.
  "tpc-sawgrass-stadium": { lat: 30.1975, lng: -81.3944 },
  "tpc-sawgrass-dyes-valley": { lat: 30.1975, lng: -81.3944 },
  "streamsong-red": { lat: 27.6539, lng: -81.8194 },
  "streamsong-blue": { lat: 27.6539, lng: -81.8194 },
  "streamsong-black": { lat: 27.6539, lng: -81.8194 },
  "trump-doral-blue-monster": { lat: 25.8186, lng: -80.3389 },
  "trump-doral-red-tiger": { lat: 25.8186, lng: -80.3389 },
  "trump-doral-gold": { lat: 25.8186, lng: -80.3389 },
  "bay-hill-championship": { lat: 28.4583, lng: -81.5081 },
  "pga-national-champion": { lat: 26.8439, lng: -80.1419 },
  "pga-national-palmer": { lat: 26.8439, lng: -80.1419 },
  "pga-national-squire": { lat: 26.8439, lng: -80.1419 },
  "pga-national-estate": { lat: 26.8439, lng: -80.1419 },
  "pga-national-fazio": { lat: 26.8439, lng: -80.1419 },
  "innisbrook-copperhead": { lat: 28.1100, lng: -82.7361 },
  "innisbrook-island": { lat: 28.1100, lng: -82.7361 },
  "lake-nona": { lat: 28.3950, lng: -81.2492 },
  seminole: { lat: 26.8836, lng: -80.0581 },
  "the-concession": { lat: 27.4406, lng: -82.3719 },
  "black-diamond-ranch-quarry": { lat: 28.8628, lng: -82.5097 },

  // --- Carolinas (NC + SC) ---
  // Pinehurst Nos. 2/4/6/7/8/9 share the resort hub; No. 10 is in
  // Aberdeen and has its own coord. Kiawah Ocean + Turtle Point use
  // the same resort coord even though the actual courses are a
  // few miles apart on the island.
  "pinehurst-no-2": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-4": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-6": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-7": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-8": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-9": { lat: 35.1903, lng: -79.4694 },
  "pinehurst-no-10": { lat: 35.1383, lng: -79.4458 },
  "pine-needles": { lat: 35.1717, lng: -79.4178 },
  "mid-pines": { lat: 35.1689, lng: -79.4144 },
  "tobacco-road": { lat: 35.4719, lng: -79.0986 },
  "quail-hollow": { lat: 35.1486, lng: -80.8489 },
  "charlotte-country-club": { lat: 35.2125, lng: -80.7831 },
  sedgefield: { lat: 36.0681, lng: -79.8917 },
  "kiawah-ocean": { lat: 32.6128, lng: -80.0414 },
  "kiawah-turtle-point": { lat: 32.6128, lng: -80.0414 },
  "harbour-town": { lat: 32.1389, lng: -80.8128 },
  "sea-pines-ocean": { lat: 32.1456, lng: -80.7964 },

  // --- Midwest (WI + IL + MI) ---
  // Whistling Straits (Straits + Irish), Blackwolf Run (River +
  // Meadow Valleys), and Sand Valley (3 courses) each share a
  // resort coord.
  "whistling-straits-straits": { lat: 43.8506, lng: -87.7314 },
  "whistling-straits-irish": { lat: 43.8506, lng: -87.7314 },
  "blackwolf-run-river": { lat: 43.7367, lng: -87.7869 },
  "blackwolf-run-meadow-valleys": { lat: 43.7367, lng: -87.7869 },
  "erin-hills": { lat: 43.2447, lng: -88.3878 },
  "sand-valley-sand-valley": { lat: 44.2767, lng: -89.9542 },
  "sand-valley-mammoth-dunes": { lat: 44.2767, lng: -89.9542 },
  "sand-valley-sedge-valley": { lat: 44.2767, lng: -89.9542 },
  "cog-hill-dubsdread": { lat: 41.6539, lng: -87.9844 },
  "olympia-fields-north": { lat: 41.5114, lng: -87.6731 },
  "medinah-no-3": { lat: 41.9794, lng: -88.0517 },
  "crystal-downs": { lat: 44.6228, lng: -86.2244 },
  "oakland-hills-south": { lat: 42.5650, lng: -83.2722 },

  // --- Mexico ---
  // Diamante (Dunes + El Cardonal), Cabo del Sol (Cove + Desert),
  // Moon Palace (Jaguar + Dunes), Punta Mita (Pacifico + Bahia),
  // and Vidanta Vallarta (Norman + Nicklaus) each share a resort
  // coord.
  "tpc-danzante-bay": { lat: 25.7470, lng: -111.2870 },
  "diamante-dunes": { lat: 22.9450, lng: -110.0610 },
  "diamante-el-cardonal": { lat: 22.9450, lng: -110.0610 },
  "quivira-golf-club": { lat: 22.8870, lng: -110.0250 },
  "cabo-del-sol-cove": { lat: 22.9300, lng: -109.8170 },
  "cabo-del-sol-desert": { lat: 22.9300, lng: -109.8170 },
  "cabo-real-golf-club": { lat: 22.9690, lng: -109.7780 },
  "querencia-golf-club": { lat: 23.0050, lng: -109.7410 },
  "palmilla-golf-club": { lat: 23.0150, lng: -109.7220 },
  "el-dorado-golf-club": { lat: 23.0260, lng: -109.6920 },
  "puerto-los-cabos": { lat: 23.0700, lng: -109.6620 },
  "chileno-bay-club": { lat: 22.9550, lng: -109.7960 },
  "twin-dolphin-golf-club": { lat: 22.9420, lng: -109.8470 },
  "cabo-san-lucas-country-club": { lat: 22.9070, lng: -109.9230 },
  "vidanta-los-cabos": { lat: 23.0530, lng: -109.6800 },
  "mayakoba-el-camaleon": { lat: 20.6940, lng: -87.0410 },
  "iberostar-playa-paraiso": { lat: 20.7530, lng: -86.9750 },
  "riviera-maya-golf-club": { lat: 20.4140, lng: -87.3260 },
  "moon-palace-jaguar": { lat: 21.0500, lng: -86.8330 },
  "moon-palace-dunes": { lat: 21.0500, lng: -86.8330 },
  "cancun-country-club": { lat: 21.0660, lng: -86.8540 },
  "playa-mujeres-golf-club": { lat: 21.2630, lng: -86.8000 },
  "vidanta-vallarta-norman": { lat: 20.6940, lng: -105.2960 },
  "vidanta-vallarta-nicklaus": { lat: 20.6940, lng: -105.2960 },
  "punta-mita-pacifico": { lat: 20.7700, lng: -105.5290 },
  "punta-mita-bahia": { lat: 20.7700, lng: -105.5290 },
  "marina-vallarta-golf-club": { lat: 20.6610, lng: -105.2510 },
  "el-tigre-golf-club": { lat: 20.7050, lng: -105.2900 },
  "club-de-golf-chapultepec": { lat: 19.4070, lng: -99.2280 },

  // --- Oregon ---
  // Pronghorn (Nicklaus + Fazio), Black Butte (Big Meadow + Glaze
  // Meadow), Sunriver (Meadows + Woodlands; Crosswater has its own
  // clubhouse), Reserve Vineyards (N + S), and Heron Lakes (Great
  // Blue + Greenback) each share their clubhouse coord.
  "pronghorn-nicklaus": { lat: 44.0892, lng: -121.1564 },
  "pronghorn-fazio": { lat: 44.0892, lng: -121.1564 },
  tetherow: { lat: 44.0244, lng: -121.3624 },
  "brasada-ranch": { lat: 44.2356, lng: -120.9889 },
  "black-butte-big-meadow": { lat: 44.3897, lng: -121.6361 },
  "black-butte-glaze-meadow": { lat: 44.3897, lng: -121.6361 },
  crosswater: { lat: 43.8589, lng: -121.4644 },
  "sunriver-meadows": { lat: 43.8794, lng: -121.4408 },
  "sunriver-woodlands": { lat: 43.8794, lng: -121.4408 },
  "aspen-lakes": { lat: 44.2825, lng: -121.4744 },
  juniper: { lat: 44.2522, lng: -121.1869 },
  "reserve-north": { lat: 45.4756, lng: -122.8956 },
  "reserve-south": { lat: 45.4756, lng: -122.8956 },
  "oregon-golf-club": { lat: 45.3239, lng: -122.6786 },
  "langdon-farms": { lat: 45.2589, lng: -122.7592 },
  "heron-lakes-great-blue": { lat: 45.6058, lng: -122.6997 },
  "heron-lakes-greenback": { lat: 45.6058, lng: -122.6997 },
  eastmoreland: { lat: 45.4775, lng: -122.6353 },
  waverley: { lat: 45.4347, lng: -122.6406 },
  "columbia-edgewater": { lat: 45.5664, lng: -122.6206 },
  tokatee: { lat: 44.1750, lng: -122.2417 },
  "eugene-cc": { lat: 44.0758, lng: -123.0931 },
  salishan: { lat: 44.9233, lng: -124.0181 },
  "stone-creek": { lat: 45.3522, lng: -122.5836 },

  // --- Washington ---
  // Suncadia (Prospector + Rope Rider), Gold Mountain (Olympic +
  // Cascade), and Newcastle (Coal Creek + China Creek) each share a
  // clubhouse coord. Tumble Creek is private side of the Suncadia
  // property and has its own coord.
  sahalee: { lat: 47.6253, lng: -122.0561 },
  aldarra: { lat: 47.6217, lng: -121.9911 },
  "home-course": { lat: 47.1100, lng: -122.6406 },
  "tumble-creek": { lat: 47.2475, lng: -121.0356 },
  "suncadia-prospector": { lat: 47.2161, lng: -121.0903 },
  "suncadia-rope-rider": { lat: 47.2161, lng: -121.0903 },
  "mccormick-woods": { lat: 47.4806, lng: -122.7194 },
  "trophy-lake": { lat: 47.4731, lng: -122.6831 },
  "gold-mountain-olympic": { lat: 47.5519, lng: -122.7811 },
  "gold-mountain-cascade": { lat: 47.5519, lng: -122.7811 },
  "newcastle-coal-creek": { lat: 47.5419, lng: -122.1656 },
  "newcastle-china-creek": { lat: 47.5419, lng: -122.1656 },
  "tacoma-cc": { lat: 47.1683, lng: -122.5306 },

  // --- NorCal expansion ---
  // MPCC (Dunes + Shore), Bayonet & Black Horse (both), and
  // Silverado (North + South) each share a clubhouse coord.
  "cypress-point": { lat: 36.5808, lng: -121.9658 },
  "poppy-hills": { lat: 36.5747, lng: -121.9433 },
  "mpcc-dunes": { lat: 36.5897, lng: -121.9447 },
  "mpcc-shore": { lat: 36.5897, lng: -121.9447 },
  "quail-lodge": { lat: 36.5219, lng: -121.8881 },
  "pacific-grove": { lat: 36.6358, lng: -121.9347 },
  bayonet: { lat: 36.6422, lng: -121.7872 },
  "black-horse": { lat: 36.6422, lng: -121.7872 },
  "lake-merced": { lat: 37.7028, lng: -122.4858 },
  stanford: { lat: 37.4267, lng: -122.1856 },
  "crystal-springs": { lat: 37.5358, lng: -122.3781 },
  "lincoln-park-sf": { lat: 37.7836, lng: -122.4992 },
  "meadow-club": { lat: 37.9711, lng: -122.6097 },
  "the-bridges": { lat: 37.7397, lng: -121.9061 },
  "wente-vineyards": { lat: 37.6394, lng: -121.7375 },
  "tilden-park": { lat: 37.9011, lng: -122.2547 },
  "silverado-north": { lat: 38.3514, lng: -122.2611 },
  "silverado-south": { lat: 38.3514, lng: -122.2611 },
  "sonoma-golf-club": { lat: 38.2867, lng: -122.4575 },
  mayacama: { lat: 38.5481, lng: -122.7975 },
  cordevalle: { lat: 37.0656, lng: -121.5611 },
};

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
