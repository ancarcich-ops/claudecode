"use client";

import { useTransition } from "react";
import type { Aversion } from "@prisma/client";
import { toast } from "sonner";
import { relativeDay, whoLabel } from "@/lib/format";
import { deleteAversion } from "@/lib/actions";

export default function AversionItem({
  aversion,
  momName,
  partnerName,
}: {
  aversion: Aversion;
  momName: string;
  partnerName: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="card rise flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">{"🤢".repeat(Math.min(aversion.severity, 3))}</span>
          <h3 className="truncate font-display text-lg font-semibold text-ink">{aversion.food}</h3>
        </div>
        <p className="mt-0.5 text-xs text-mute">
          {relativeDay(aversion.createdAt)} · by {whoLabel(aversion.loggedBy, momName, partnerName)}
          {aversion.week != null && ` · wk ${aversion.week}`}
        </p>
        {aversion.notes && <p className="mt-1 text-sm text-mute">{aversion.notes}</p>}
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            await deleteAversion(aversion.id);
            toast("Removed");
          })
        }
        disabled={pending}
        aria-label="Delete"
        className="shrink-0 rounded-full px-2 py-1 text-mute hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}
