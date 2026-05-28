// Week-by-week "baby is the size of a ___" produce chart. Keyed by
// gestational week (4–40). Each entry pairs a fruit/veg with an emoji and a
// playful one-liner. Weeks before 4 fall back to "poppy seed"; anything past
// 40 stays on "pumpkin / watermelon".
export type FruitSize = {
  fruit: string;
  emoji: string;
  note: string;
};

const CHART: Record<number, FruitSize> = {
  4: { fruit: "poppy seed", emoji: "⚫️", note: "Smaller than a sprinkle." },
  5: { fruit: "sesame seed", emoji: "🟤", note: "A little speck of magic." },
  6: { fruit: "sweet pea", emoji: "🫛", note: "Tiny but mighty." },
  7: { fruit: "blueberry", emoji: "🫐", note: "Pop-able and perfect." },
  8: { fruit: "raspberry", emoji: "🍇", note: "All curled up." },
  9: { fruit: "cherry", emoji: "🍒", note: "Sweet little thing." },
  10: { fruit: "strawberry", emoji: "🍓", note: "Officially a fetus!" },
  11: { fruit: "fig", emoji: "🫐", note: "Kicking, but you can't feel it yet." },
  12: { fruit: "lime", emoji: "🍈", note: "Reflexes are kicking in." },
  13: { fruit: "lemon", emoji: "🍋", note: "Last week of trimester one." },
  14: { fruit: "peach", emoji: "🍑", note: "Hello, trimester two!" },
  15: { fruit: "apple", emoji: "🍎", note: "Wiggling those toes." },
  16: { fruit: "avocado", emoji: "🥑", note: "Might feel first flutters soon." },
  17: { fruit: "pomegranate", emoji: "🔴", note: "Putting on some fat." },
  18: { fruit: "bell pepper", emoji: "🫑", note: "Yawning and hiccuping." },
  19: { fruit: "mango", emoji: "🥭", note: "Developing a sense of taste." },
  20: { fruit: "banana", emoji: "🍌", note: "Halfway there!" },
  21: { fruit: "carrot", emoji: "🥕", note: "Swallowing little sips." },
  22: { fruit: "spaghetti squash", emoji: "🎃", note: "Looking like a tiny newborn." },
  23: { fruit: "grapefruit", emoji: "🍊", note: "Can hear your voice now." },
  24: { fruit: "ear of corn", emoji: "🌽", note: "Face is fully formed." },
  25: { fruit: "rutabaga", emoji: "🥔", note: "Growing hair!" },
  26: { fruit: "scallion bunch", emoji: "🌿", note: "Eyes starting to open." },
  27: { fruit: "cauliflower", emoji: "🥦", note: "Last week of trimester two." },
  28: { fruit: "eggplant", emoji: "🍆", note: "Welcome to the home stretch." },
  29: { fruit: "butternut squash", emoji: "🎃", note: "Muscles and lungs maturing." },
  30: { fruit: "cabbage", emoji: "🥬", note: "About 3 pounds now." },
  31: { fruit: "coconut", emoji: "🥥", note: "All five senses working." },
  32: { fruit: "jicama", emoji: "🥔", note: "Practicing breathing." },
  33: { fruit: "pineapple", emoji: "🍍", note: "Bones hardening (except the skull)." },
  34: { fruit: "cantaloupe", emoji: "🍈", note: "Probably head-down by now." },
  35: { fruit: "honeydew melon", emoji: "🍈", note: "Running out of room!" },
  36: { fruit: "head of romaine", emoji: "🥬", note: "Packing on the chub." },
  37: { fruit: "bunch of swiss chard", emoji: "🌿", note: "Officially early-term." },
  38: { fruit: "leek", emoji: "🌿", note: "Gripping like a champ." },
  39: { fruit: "mini watermelon", emoji: "🍉", note: "Any day now!" },
  40: { fruit: "small pumpkin", emoji: "🎃", note: "Full term — ready when she is." },
};

export function fruitForWeek(week: number | null | undefined): FruitSize {
  if (week == null || week < 4) {
    return { fruit: "poppy seed", emoji: "⚫️", note: "Just getting started." };
  }
  if (week > 40) return CHART[40];
  // Walk down to the nearest charted week (every week 4-40 is present, but
  // this keeps it safe if the chart ever has gaps).
  for (let w = week; w >= 4; w--) {
    if (CHART[w]) return CHART[w];
  }
  return CHART[4];
}
