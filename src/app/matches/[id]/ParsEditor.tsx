"use client";

import { useState, useTransition } from "react";

export default function ParsEditor({
  action,
  matchId,
  holes,
  startingHole = 1,
  pars,
}: {
  action: (formData: FormData) => Promise<void>;
  matchId: string;
  holes: number;
  startingHole?: number;
  pars: number[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<number[]>(pars);
  const [pending, startTransition] = useTransition();

  const total = values.reduce((a, b) => a + b, 0);
  const setIdx = (i: number, v: number) =>
    setValues((cur) => cur.map((c, idx) => (idx === i ? v : c)));

  const submit = () => {
    const fd = new FormData();
    fd.set("matchId", matchId);
    for (const v of values) fd.append("par", String(v));
    startTransition(() => {
      action(fd);
    });
  };

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
          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Saving..." : "Save pars"}
            </button>
          </div>
          <p className="text-xs text-mute">
            Per-hole pars sharpen the live odds projection. Default is par 72
            with a mix of 3s, 4s, and 5s.
          </p>
        </div>
      )}
    </div>
  );
}
