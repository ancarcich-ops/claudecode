// Curated course presets for the Los Angeles and Orange County area.
//
// Each preset carries the course's published par total and hole count. The
// per-hole `pars` array is a standardized layout that sums to that total -
// good enough to seed live odds at match creation. Creators can tweak any
// hole in the "Course pars" editor on the match page.

export type CourseAccess = "public" | "private" | "resort" | "municipal";
export type CourseRegion = "LA" | "OC" | "IE" | "CV" | "SD" | "VC" | "PNW" | "TX";

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
