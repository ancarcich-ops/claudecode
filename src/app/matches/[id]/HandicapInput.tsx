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
    <label
      className="chip gap-0.5 px-1.5"
      title="Edit handicap (creator only)"
    >
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
        size={3}
        className="w-9 bg-transparent text-ink text-center focus:outline-none focus:ring-1 focus:ring-accent rounded-sm appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
