"use client";

import { useFormStatus } from "react-dom";
import { removeFromTournamentRosterAction } from "@/lib/actions";

// Creator-only "Remove" control on a roster row. Confirms before firing
// the server action so a stray tap can't quietly drop a real player.
export default function RemoveRosterButton({
  playerId,
  displayName,
}: {
  playerId: string;
  displayName: string;
}) {
  return (
    <form
      action={removeFromTournamentRosterAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove ${displayName} from this tournament? Their account isn't deleted — they just come off the roster.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="playerId" value={playerId} />
      <RemoveButton />
    </form>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[11px] text-mute hover:text-danger disabled:opacity-50 shrink-0"
      aria-label="Remove from tournament"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
