import Avatar from "boring-avatars";

// Use the seat palette so avatars feel native to the app.
const PALETTE = ["#34d399", "#60a5fa", "#fbbf24", "#fb923c", "#22d3ee", "#f472b6"];

export type AvatarVariant =
  | "marble"
  | "beam"
  | "pixel"
  | "sunset"
  | "ring"
  | "bauhaus";

export const VARIANTS: AvatarVariant[] = [
  "beam",
  "marble",
  "sunset",
  "pixel",
  "ring",
  "bauhaus",
];

export function isVariant(s: string): s is AvatarVariant {
  return (VARIANTS as string[]).includes(s);
}

// Render an avatar with user-level customization. Resolution order:
//   1. If avatarUrl is set, render it as an <img>. (User uploaded a photo.)
//   2. Otherwise render the boring-avatars SVG with avatarSeed/avatarVariant.
//   3. seed/variant default to the user id and "beam" if unset.
//
// Backwards compatible: existing callers that pass just `seed` keep
// working -- they get the generated SVG with the default variant.
export default function PlayerAvatar({
  seed,
  size = 24,
  variant = "beam",
  avatarUrl,
  rounded = true,
}: {
  seed: string;
  size?: number;
  variant?: AvatarVariant;
  avatarUrl?: string | null;
  rounded?: boolean;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: rounded ? "50%" : 4,
          objectFit: "cover",
        }}
      />
    );
  }
  return (
    <Avatar
      size={size}
      name={seed}
      variant={variant}
      colors={PALETTE}
      square={!rounded}
    />
  );
}
