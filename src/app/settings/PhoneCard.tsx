"use client";

import { useState, useTransition } from "react";
import { setPhoneAction } from "@/lib/actions";

// Opt-in phone number for people-search. Adding one makes you findable by
// your full number (exact match only — it's never shown to anyone).
export default function PhoneCard({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ? formatPhone(initial) : "");
  const [pending, start] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const digits = value.replace(/\D/g, "");
  const valid = digits.length === 0 || digits.length >= 10;

  const save = (raw: string) => {
    const fd = new FormData();
    fd.set("phone", raw);
    start(async () => {
      await setPhoneAction(fd);
      setSavedMsg(raw.trim() === "" ? "Removed." : "Saved.");
      setTimeout(() => setSavedMsg(null), 2500);
    });
  };

  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold text-ink">
        Phone number
      </h2>
      <p className="text-sm text-mute mt-1">
        Optional. Add your number so friends can find you by it in{" "}
        <span className="text-ink">Find people</span>. Only someone who knows
        your <strong>full</strong> number can — it&rsquo;s matched exactly and
        never shown to anyone.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="(818) 309-5011"
          className="flex-1 rounded-[11px] border border-border bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <button
          type="button"
          disabled={pending || !valid || digits.length < 10}
          onClick={() => save(value)}
          className="btn btn-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3 min-h-[18px]">
        {!valid && (
          <span className="text-[12px] text-danger">
            Enter a full 10-digit number.
          </span>
        )}
        {savedMsg && (
          <span className="text-[12px] text-accent">{savedMsg}</span>
        )}
        {initial && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setValue("");
              save("");
            }}
            className="text-[12px] text-mute hover:text-danger ml-auto"
          >
            Remove number
          </button>
        )}
      </div>
    </section>
  );
}

function formatPhone(d: string): string {
  if (d.length !== 10) return d;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
