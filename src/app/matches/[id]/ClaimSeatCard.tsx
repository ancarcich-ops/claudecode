"use client";

// Shown on a round to a viewer who ISN'T yet linked to a seat but could
// have played it -- e.g. their spot was added by name and never tied to
// their account. Claiming links the seat so the round counts toward their
// stats, feeds, and "your rounds" ordering.

import { useFormStatus } from "react-dom";
import { claimSeatAction } from "@/lib/actions";

export default function ClaimSeatCard({
  matchId,
  seats,
}: {
  matchId: string;
  seats: { id: string; displayName: string }[];
}) {
  if (seats.length === 0) return null;
  return (
    <div className="card p-4 border-accent/40 bg-accent/5">
      <div className="text-sm font-semibold text-ink">
        Played in this round?
      </div>
      <p className="text-[12px] text-mute mt-0.5 leading-snug">
        Claim your spot so it&apos;s credited to your account and counts
        toward your stats.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {seats.map((s) => (
          <form key={s.id} action={claimSeatAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="matchPlayerId" value={s.id} />
            <ClaimButton name={s.displayName} />
          </form>
        ))}
      </div>
    </div>
  );
}

function ClaimButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-accent/60 bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-accent/20 disabled:opacity-50 transition"
    >
      {pending ? "Claiming…" : `I'm ${name}`}
    </button>
  );
}
