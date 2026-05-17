"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

const STORAGE_KEY = "sticks.onboarded.v3";

// Small "Show me the welcome flow again" button. Clears the localStorage
// gate that suppresses onboarding after the first run, then reloads home
// so the modal opens fresh.
export default function ReplayOnboarding() {
  const router = useRouter();
  const replay = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      toast.success("Onboarding will replay on the home screen.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Couldn't reset onboarding.");
    }
  };
  return (
    <button
      type="button"
      onClick={replay}
      className="btn btn-ghost text-xs"
    >
      Show welcome flow again
    </button>
  );
}
