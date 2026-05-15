"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string };
type EventKind = "BINGO" | "BANGO" | "BONGO";
type EventsByHole = Record<number, Partial<Record<EventKind, string | null>>>;

const COLUMNS: { kind: EventKind; label: string; hint: string }[] = [
  { kind: "BINGO", label: "Bingo", hint: "first on the green" },
  { kind: "BANGO", label: "Bango", hint: "closest once on" },
  { kind: "BONGO", label: "Bongo", hint: "first in the hole" },
];

export default function BBBEditor({
  sideGameId,
  holes,
  players,
  events,
  locked,
}: {
  sideGameId: string;
  holes: number;
  players: Player[];
  // Pre-shaped: events[hole][kind] = matchPlayerId | null
  events: EventsByHole;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setEvent = (hole: number, kind: EventKind, playerId: string) => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("hole", String(hole));
    fd.set("kind", kind);
    fd.set("matchPlayerId", playerId);
    startTransition(async () => {
      await recordSideGameEventAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-mute">
            <th className="text-left font-medium uppercase tracking-wider py-1.5 pr-2">
              Hole
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.kind}
                className="text-left font-medium uppercase tracking-wider py-1.5 px-1.5"
              >
                <div>{c.label}</div>
                <div className="text-[10px] normal-case tracking-normal text-mute/70">
                  {c.hint}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: holes }, (_, i) => i + 1).map((h) => (
            <tr key={h} className="border-t border-border">
              <td className="py-1.5 pr-2 font-mono tabular-nums text-mute">
                {h}
              </td>
              {COLUMNS.map((c) => {
                const current = events[h]?.[c.kind] ?? "";
                return (
                  <td key={c.kind} className="py-1 px-1.5">
                    <select
                      value={current ?? ""}
                      onChange={(e) => setEvent(h, c.kind, e.target.value)}
                      disabled={pending || locked}
                      aria-label={`${c.label} on hole ${h}`}
                      className="input h-8 py-0 px-1.5 text-xs w-full min-w-0"
                    >
                      <option value="">—</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
