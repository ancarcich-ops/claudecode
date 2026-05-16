"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importDemoRoundsAction } from "@/lib/actions";

// One-click "seed my history" button. Calls the server action, shows a
// toast, then disables itself for the session if everything was already
// imported. Safe to retry -- the action dedupes on (user, course, date).
export default function DemoRoundsImporter() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const run = () => {
    startTransition(async () => {
      try {
        const res = await importDemoRoundsAction();
        if (res.created > 0) {
          toast.success(
            `Imported ${res.created} round${res.created === 1 ? "" : "s"}.${
              res.skipped > 0 ? ` ${res.skipped} already there.` : ""
            }`,
          );
        } else {
          toast.info("These rounds are already on your account.");
        }
        setDone(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Import failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Demo history
          </h2>
          <p className="text-[11px] text-mute mt-1 max-w-md">
            Imports 6 completed rounds (Alondra, Torrey, Escena, Recreation
            Park, Wolf Creek) so /stats has real data to render. Idempotent
            — running it twice doesn&apos;t duplicate.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={pending || done}
        className="btn btn-primary"
      >
        {pending
          ? "Importing…"
          : done
            ? "Imported ✓"
            : "Import demo rounds"}
      </button>
    </div>
  );
}
