"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

export default function ParsEditor({
  action,
  saveCourseAction,
  matchId,
  holes,
  startingHole = 1,
  pars,
}: {
  // Save the pars to the match (per-round override).
  action: (formData: FormData) => Promise<void>;
  // Optionally also promote those pars to the course-level default so
  // future matches at this course inherit them automatically. When
  // omitted (e.g. non-creator view), the button is hidden.
  saveCourseAction?: (formData: FormData) => Promise<void>;
  matchId: string;
  holes: number;
  startingHole?: number;
  pars: number[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<number[]>(pars);
  const [pending, startTransition] = useTransition();
  const [coursePending, startCourseTransition] = useTransition();

  const total = values.reduce((a, b) => a + b, 0);
  const setIdx = (i: number, v: number) =>
    setValues((cur) => cur.map((c, idx) => (idx === i ? v : c)));

  const buildFormData = () => {
    const fd = new FormData();
    fd.set("matchId", matchId);
    for (const v of values) fd.append("par", String(v));
    return fd;
  };

  const submit = () => {
    const fd = buildFormData();
    startTransition(async () => {
      try {
        await action(fd);
        toast.success("Match pars saved.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save pars.");
      }
    });
  };

  const saveToCourse = () => {
    if (!saveCourseAction) return;
    const fd = buildFormData();
    startCourseTransition(async () => {
      try {
        await saveCourseAction(fd);
        toast.success("Saved as course default. Future rounds inherit these.");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't save course default.",
        );
      }
    });
  };

  const dirty = values.some((v, i) => v !== pars[i]);

  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-display text-base font-semibold text-ink">
          Course pars · par {total}
        </span>
        <span className="text-xs text-mute">{open ? "Hide" : "Edit"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-9 gap-1.5">
            {values.map((v, i) => (
              <label
                key={i}
                className="flex flex-col items-center gap-1 text-[11px] text-mute"
              >
                <span>{startingHole + i}</span>
                <select
                  value={v}
                  onChange={(e) => setIdx(i, Number(e.target.value))}
                  className="w-full bg-panel2 border border-border rounded-md text-ink text-center font-mono text-sm py-1"
                >
                  {[3, 4, 5, 6].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {saveCourseAction && (
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={saveToCourse}
                disabled={coursePending || pending}
                title="Save these pars as the course-level default. New rounds here will inherit them."
              >
                {coursePending ? "Saving…" : "Save as course default"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={pending || !dirty}
            >
              {pending ? "Saving..." : "Save pars"}
            </button>
          </div>
          <p className="text-xs text-mute">
            Per-hole pars sharpen the live odds projection. The "Save as course
            default" option promotes them to the course so future matches at
            this course auto-fill the same layout.
          </p>
        </div>
      )}
    </div>
  );
}
