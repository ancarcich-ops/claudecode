"use client";

import { useState, useTransition } from "react";

export default function HandicapInput({
  action,
  matchId,
  matchPlayerId,
  handicap,
}: {
  action: (formData: FormData) => Promise<void>;
  matchId: string;
  matchPlayerId: string;
  handicap: number;
}) {
  const [value, setValue] = useState(String(handicap));
  const [pending, startTransition] = useTransition();

  const submit = (next: string) => {
    if (next === String(handicap)) return;
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", matchPlayerId);
    fd.set("handicap", next);
    startTransition(() => {
      action(fd);
    });
  };

  return (
    <label className="chip gap-1" title="Edit handicap (creator only)">
      hcp
      <input
        type="number"
        step="0.1"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => submit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-12 bg-transparent text-ink text-right focus:outline-none focus:ring-1 focus:ring-accent rounded-sm"
      />
    </label>
  );
}
