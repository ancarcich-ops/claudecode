// Per-instance accent palettes. The `key` is persisted in Settings.palette and
// set as `data-palette` on <html>; the matching CSS lives in globals.css. The
// `accent` hex is reused for the color swatch in the picker and passed to the
// Recharts charts (which need a real color value, not a CSS variable).
export type PaletteKey =
  | "blush"
  | "sky"
  | "lavender"
  | "mint"
  | "peach"
  | "sunshine"
  | "rose";

export type Palette = { key: PaletteKey; label: string; accent: string };

export const PALETTES: Palette[] = [
  { key: "blush", label: "Blush", accent: "#ec7ba4" },
  { key: "sky", label: "Sky", accent: "#5aa6dc" },
  { key: "lavender", label: "Lavender", accent: "#a88bdc" },
  { key: "mint", label: "Mint", accent: "#3fb98f" },
  { key: "peach", label: "Peach", accent: "#ef8f5a" },
  { key: "sunshine", label: "Sunshine", accent: "#e0a93b" },
  { key: "rose", label: "Rose", accent: "#e05a78" },
];

const DEFAULT = PALETTES[0];

export function accentFor(key: string | null | undefined): string {
  return PALETTES.find((p) => p.key === key)?.accent ?? DEFAULT.accent;
}

export function paletteKey(key: string | null | undefined): PaletteKey {
  return PALETTES.some((p) => p.key === key) ? (key as PaletteKey) : "blush";
}
