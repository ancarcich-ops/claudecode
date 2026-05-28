// Craving categories. `key` is what we persist; everything else is for
// display (emoji + label) and charts (a stable color per category).
export type CategoryKey =
  | "sweet"
  | "salty"
  | "sour"
  | "savory"
  | "spicy"
  | "carbs"
  | "fruit"
  | "dairy"
  | "drink"
  | "other";

export type Category = {
  key: CategoryKey;
  label: string;
  emoji: string;
  color: string; // hex, used by recharts
};

export const CATEGORIES: Category[] = [
  { key: "sweet", label: "Sweet", emoji: "🍰", color: "#F48FB1" },
  { key: "salty", label: "Salty", emoji: "🥨", color: "#E5A663" },
  { key: "sour", label: "Sour", emoji: "🍋", color: "#E6C84F" },
  { key: "savory", label: "Savory", emoji: "🍜", color: "#C58BD6" },
  { key: "spicy", label: "Spicy", emoji: "🌶️", color: "#E5736B" },
  { key: "carbs", label: "Carbs", emoji: "🍞", color: "#D9A679" },
  { key: "fruit", label: "Fruit", emoji: "🍓", color: "#EF6F9B" },
  { key: "dairy", label: "Dairy", emoji: "🧀", color: "#8FB8E6" },
  { key: "drink", label: "Drink", emoji: "🥤", color: "#7FC7C0" },
  { key: "other", label: "Other", emoji: "🍽️", color: "#B6A6C9" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryMeta(key: string | null | undefined): Category {
  return (key && BY_KEY.get(key as CategoryKey)) || CATEGORIES[CATEGORIES.length - 1];
}
