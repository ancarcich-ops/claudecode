"use client";

import { useState, useTransition } from "react";

type Player = {
  id: string;
  displayName: string;
  color: string;
  probability: number;
  wagerCount: number;
};

export default function WagerForm({
  action,
  matchId,
  players,
  currentPickId,
}: {
  action: (formData: FormData) => Promise<void>;
  matchId: string;
  players: Player[];
  currentPickId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [pickId, setPickId] = useState<string | null>(currentPickId);

  const submit = (id: string) => {
    setPickId(id);
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("pickedPlayerId", id);
    startTransition(() => {
      action(fd);
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {players.map((p) => {
        const active = pickId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => submit(p.id)}
            disabled={pending}
            className={`text-left rounded-md border px-3 py-3 transition-colors ${
              active
                ? "border-accent bg-accent/10"
                : "border-border bg-panel2 hover:border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: p.color }}
                />
                <span className="font-medium">{p.displayName}</span>
              </span>
              <span className="font-mono tabular-nums text-accent">
                {(p.probability * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-xs text-mute mt-1">
              {active ? "Your pick" : `Tap to pick ${p.displayName}`}
              {" · "}
              {p.wagerCount} pick{p.wagerCount === 1 ? "" : "s"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
