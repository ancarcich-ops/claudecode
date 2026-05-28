"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addAversion } from "@/lib/actions";
import type { Who } from "@/lib/identity";

// Compact form for logging a food Geena suddenly can't stand. Severity uses a
// 🤢 scale instead of hearts.
export default function AversionForm({ who }: { who: Who }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [severity, setSeverity] = useState(3);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("food") || "").trim()) {
      toast.error("Name the offending food 🤢");
      return;
    }
    startTransition(async () => {
      await addAversion(fd);
      toast.success("Added to the no-fly list 🚫");
      form.reset();
      setSeverity(3);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <input type="hidden" name="loggedBy" value={who} />
      <input type="hidden" name="severity" value={severity} />
      <div>
        <label className="label" htmlFor="food">
          What can she not stand right now?
        </label>
        <input id="food" name="food" placeholder="Coffee, eggs, the smell of onions…" className="input" />
      </div>
      <div className="flex items-center justify-between">
        <span className="label mb-0">How bad?</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSeverity(i)}
              aria-label={`Severity ${i}`}
              className={`text-2xl transition-transform ${
                i <= severity ? "pop" : "opacity-30 grayscale"
              }`}
            >
              🤢
            </button>
          ))}
        </div>
      </div>
      <input name="notes" placeholder="Notes (optional)" className="input" />
      <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
        {pending ? "Saving…" : "Add to Foods Hated"}
      </button>
    </form>
  );
}
