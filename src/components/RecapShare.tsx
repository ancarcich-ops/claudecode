"use client";

import { toast } from "sonner";

// Share button for the recap. Uses the Web Share API on phones (so it can go
// straight to texts/Instagram), falls back to copying text, and otherwise
// nudges the user to screenshot.
export default function RecapShare({ text }: { text: string }) {
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bloom — weekly recap", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Recap copied — paste it anywhere 💕");
    } catch {
      toast("Screenshot the card to share 📸");
    }
  }

  return (
    <button onClick={share} className="btn btn-primary w-full py-3">
      Share this recap 💌
    </button>
  );
}
