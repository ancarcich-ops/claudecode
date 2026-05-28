"use client";

import { useState, useTransition } from "react";
import type { Craving } from "@prisma/client";
import { toast } from "sonner";
import IntensityHearts from "./IntensityHearts";
import StarRating from "./StarRating";
import { categoryMeta } from "@/lib/categories";
import { relativeDay, timeLabel, whoLabel } from "@/lib/format";
import { toggleSatisfied, deleteCraving, setWild } from "@/lib/actions";
import { celebrate } from "@/lib/confetti";
import type { Who } from "@/lib/identity";

export default function CravingCard({
  craving,
  who,
  momName,
  partnerName,
}: {
  craving: Craving;
  who: Who;
  momName: string;
  partnerName: string;
}) {
  const cat = categoryMeta(craving.category);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function satisfy() {
    startTransition(async () => {
      await toggleSatisfied(craving.id, who);
      if (!craving.satisfied) {
        await celebrate();
        toast.success("Craving conquered! 🎉");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteCraving(craving.id);
      toast("Deleted");
    });
  }

  function toggleWild() {
    startTransition(() => setWild(craving.id, !craving.isWild));
  }

  return (
    <div className="card rise overflow-hidden">
      {craving.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={craving.photoUrl}
          alt={craving.food}
          className="h-40 w-full object-cover"
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{cat.emoji}</span>
              <h3 className="truncate font-display text-lg font-semibold text-ink">
                {craving.food}
              </h3>
              {craving.isWild && (
                <span className="chip border-accent/40 bg-accent/10 text-accent">✨ wild</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
              <IntensityHearts value={craving.intensity} readOnly size="sm" />
              <span>·</span>
              <span>{relativeDay(craving.cravedAt)} {timeLabel(craving.cravedAt)}</span>
              <span>·</span>
              <span>by {whoLabel(craving.loggedBy, momName, partnerName)}</span>
              {craving.week != null && (
                <>
                  <span>·</span>
                  <span>wk {craving.week}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="More"
            className="shrink-0 rounded-full px-2 py-1 text-mute hover:text-ink"
          >
            ⋯
          </button>
        </div>

        {craving.notes && (
          <p className="mt-2 text-sm text-mute">{craving.notes}</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {craving.satisfied ? (
            <button
              onClick={satisfy}
              disabled={pending}
              className="chip border-accent/40 bg-accent/10 text-accent"
            >
              ✅ Satisfied by {whoLabel(craving.satisfiedBy, momName, partnerName)}
            </button>
          ) : (
            <button
              onClick={satisfy}
              disabled={pending}
              className="btn btn-ghost px-3 py-1.5 text-xs"
            >
              Mark satisfied
            </button>
          )}
          {craving.isWild && <StarRating id={craving.id} value={craving.stars} />}
        </div>

        {open && (
          <div className="mt-3 flex gap-2 border-t border-borderSoft pt-3">
            <button onClick={toggleWild} disabled={pending} className="btn btn-ghost px-3 py-1.5 text-xs">
              {craving.isWild ? "Remove from wild" : "✨ Mark as wild"}
            </button>
            <button onClick={remove} disabled={pending} className="btn btn-danger px-3 py-1.5 text-xs">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
