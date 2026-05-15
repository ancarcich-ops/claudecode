import Avatar from "boring-avatars";

// Use the seat palette so avatars feel native to the app.
const PALETTE = ["#34d399", "#60a5fa", "#fbbf24", "#fb923c", "#22d3ee", "#f472b6"];

// Stable generated avatar from a seed (userId or username). Renders as an
// SVG with no network round-trip and no external dependency at runtime.
export default function PlayerAvatar({
  seed,
  size = 24,
  variant = "beam",
}: {
  seed: string;
  size?: number;
  variant?: "marble" | "beam" | "pixel" | "sunset" | "ring" | "bauhaus";
}) {
  return (
    <Avatar
      size={size}
      name={seed}
      variant={variant}
      colors={PALETTE}
      square={false}
    />
  );
}
