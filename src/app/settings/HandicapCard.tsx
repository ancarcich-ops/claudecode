"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateGhinNumberAction } from "@/lib/actions";

// "Handicap" settings card. Two stacked values:
//   1. Auto-computed Sticks index from logged rounds (read-only display)
//   2. Optional GHIN # the user can store for reference
export default function HandicapCard({
  currentGhin,
  computedIndex,
  fromRounds,
  totalRounds,
}: {
  currentGhin: string | null;
  // Null if too few rounds to compute.
  computedIndex: number | null;
  fromRounds: number;
  totalRounds: number;
}) {
  const [ghin, setGhin] = useState(currentGhin ?? "");
  const [pending, startTransition] = useTransition();

  const save = () => {
    const fd = new FormData();
    fd.set("ghinNumber", ghin);
    startTransition(async () => {
      try {
        await updateGhinNumberAction(fd);
        toast.success(ghin.trim() ? "GHIN # saved." : "GHIN # cleared.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  const formatIndex = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Handicap
          </h2>
          <p className="text-[11px] text-mute mt-1 max-w-md">
            Sticks index is auto-computed from your logged rounds — updates
            after every match.
          </p>
        </div>
      </div>

      {/* Computed index */}
      <div className="rounded-md border border-border bg-panel2 p-4 mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-mute">
              Sticks index
            </div>
            <div className="font-display text-3xl font-semibold tabular-nums mt-0.5">
              {computedIndex === null ? "—" : formatIndex(computedIndex)}
            </div>
          </div>
          <div className="text-right text-[11px] text-mute leading-tight">
            {computedIndex === null ? (
              <>
                Need 3+ rounds
                <br />
                <span className="font-mono tabular-nums">
                  {totalRounds}/3
                </span>{" "}
                logged
              </>
            ) : (
              <>
                from best of last{" "}
                <span className="font-mono tabular-nums">{fromRounds}</span>{" "}
                rounds
              </>
            )}
          </div>
        </div>
      </div>

      {/* GHIN number editor */}
      <label
        htmlFor="ghinNumber"
        className="block text-[10px] uppercase tracking-wider text-mute mb-1"
      >
        GHIN number{" "}
        <span className="text-mute/70 normal-case tracking-normal">
          (optional, USGA #)
        </span>
      </label>
      <div className="flex gap-2">
        <input
          id="ghinNumber"
          type="text"
          inputMode="numeric"
          value={ghin}
          onChange={(e) => setGhin(e.target.value)}
          placeholder="e.g. 7654321"
          className="input flex-1 font-mono tabular-nums"
          maxLength={12}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || ghin.trim() === (currentGhin ?? "")}
          className="btn btn-primary shrink-0"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-[11px] text-mute mt-1.5">
        Stored for reference. We can&apos;t pull your official handicap
        without a USGA partnership, so the Sticks index above is what
        powers stroke allocation in matches.
      </p>
    </div>
  );
}
