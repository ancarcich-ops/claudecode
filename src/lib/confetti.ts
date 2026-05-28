// Tiny wrapper around canvas-confetti so callers don't each repeat the
// dynamic import + reduced-motion guard. A blush-toned burst, naturally.
const COLORS = ["#ec7ba4", "#f8b8d0", "#ffd9e6", "#e0a93b", "#ffffff"];

export async function celebrate(intensity = 1) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: Math.round(60 * intensity),
    spread: 70,
    startVelocity: 38,
    origin: { y: 0.7 },
    colors: COLORS,
    scalar: 0.9,
    ticks: 160,
  });
}
