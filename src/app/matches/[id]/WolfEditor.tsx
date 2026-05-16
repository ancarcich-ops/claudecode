"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string; seat: number };

// Pre-shaped per-hole state from the server. winnerId / isPush already
// reflect auto-derivation from logged scores -- the editor only collects
// the partner choice + an optional push override.
type WolfHoleState = {
  hole: number;
  partnerId: string | null;
  isLoneWolf: boolean;
  isPreLoneWolf: boolean;
  winnerId: string | null;
  isPush: boolean;
};

// Sentinel values in the partner select for the lone-wolf options.
const LONE = "__LONE__";
const PRE_LONE = "__PRE_LONE__";

function wolfForHole(
  players: Player[],
  hole: number,
  rotation: string[] | undefined,
  startingHole: number,
): Player {
  let ordered: Player[] = [];
  if (rotation && rotation.length > 0) {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const id of rotation) {
      const p = byId.get(id);
      if (p) ordered.push(p);
    }
  }
  if (ordered.length === 0) {
    ordered = [...players].sort((a, b) => a.seat - b.seat);
  }
  return ordered[(hole - startingHole) % ordered.length];
}

export default function WolfEditor({
  sideGameId,
  holes,
  startingHole = 1,
  players,
  byHole,
  rotation,
  locked,
}: {
  sideGameId: string;
  holes: number;
  startingHole?: number;
  players: Player[];
  byHole: Record<number, WolfHoleState>;
  rotation: string[];
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send = (
    hole: number,
    kind: "PARTNER" | "LONE_WOLF" | "PRE_LONE_WOLF" | "HOLE_WINNER" | "PUSH",
    matchPlayerId: string,
  ) => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("hole", String(hole));
    fd.set("kind", kind);
    fd.set("matchPlayerId", matchPlayerId);
    startTransition(async () => {
      await recordSideGameEventAction(fd);
      router.refresh();
    });
  };

  const onPartnerChange = (hole: number, wolf: Player, value: string) => {
    if (value === "") {
      send(hole, "PARTNER", "");
    } else if (value === LONE) {
      send(hole, "LONE_WOLF", wolf.id);
    } else if (value === PRE_LONE) {
      send(hole, "PRE_LONE_WOLF", wolf.id);
    } else {
      send(hole, "PARTNER", value);
    }
  };

  const togglePush = (hole: number, currentlyPushed: boolean) => {
    // Server-side PUSH event toggles cleanly: send PUSH adds; send PUSH on a
    // pushed hole removes. matchPlayerId is unused for PUSH but required.
    send(hole, "PUSH", currentlyPushed ? "" : "push");
  };

  const playerName = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.displayName ?? "—" : "—";

  // Determine outcome label + color from the shaped state.
  const outcomeFor = (state: WolfHoleState | undefined, wolf: Player) => {
    if (!state || (!state.winnerId && !state.isPush)) {
      return { label: "—", tone: "text-mute" };
    }
    if (state.isPush) return { label: "Push", tone: "text-gold" };
    const wolfTeam = new Set<string>([wolf.id]);
    if (state.partnerId) wolfTeam.add(state.partnerId);
    if (state.winnerId && wolfTeam.has(state.winnerId)) {
      return {
        label: state.isLoneWolf
          ? state.isPreLoneWolf
            ? "Lone Wolf · 2x"
            : "Wolf wins"
          : "Wolf team",
        tone: "text-accent",
      };
    }
    return { label: "Others", tone: "text-danger" };
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: holes }, (_, i) => startingHole + i).map((h) => {
        const wolf = wolfForHole(players, h, rotation, startingHole);
        const state = byHole[h];
        const partnerValue = state?.isPreLoneWolf
          ? PRE_LONE
          : state?.isLoneWolf
            ? LONE
            : state?.partnerId ?? "";
        const choiceMade = !!state && (state.isLoneWolf || !!state.partnerId);
        const outcome = outcomeFor(state, wolf);

        return (
          <div
            key={h}
            className="rounded-md border border-border bg-panel2 px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              <div className="font-mono tabular-nums text-mute w-6 shrink-0">
                {h}
              </div>
              <div className="text-sm min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-mute leading-none">
                  Wolf
                </div>
                <div className="text-ink font-medium truncate">
                  {wolf.displayName}
                </div>
              </div>
              <div className="shrink-0 text-right min-w-0 max-w-[55%]">
                <div className="text-[10px] uppercase tracking-wider text-mute leading-none">
                  Outcome
                </div>
                <div className={`text-sm font-medium truncate ${outcome.tone}`}>
                  {outcome.label}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 mt-2.5">
              <select
                value={partnerValue}
                onChange={(e) => onPartnerChange(h, wolf, e.target.value)}
                disabled={pending || locked}
                aria-label={`Wolf partner choice on hole ${h}`}
                className="input h-9 text-sm"
              >
                <option value="">Pick partner…</option>
                <option value={LONE}>Lone Wolf</option>
                <option value={PRE_LONE}>Pre-Lone Wolf (2x)</option>
                {players.length !== 3 &&
                  players
                    .filter((p) => p.id !== wolf.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
              </select>
              <button
                type="button"
                onClick={() => togglePush(h, !!state?.isPush)}
                disabled={pending || locked}
                aria-pressed={!!state?.isPush}
                title={
                  state?.isPush
                    ? "Currently pushed — tap to clear"
                    : "Force push (override auto-result)"
                }
                className={
                  "h-9 px-3 rounded-md border text-xs uppercase tracking-wider font-semibold transition-colors " +
                  (state?.isPush
                    ? "bg-gold/15 text-gold border-gold/40"
                    : "bg-panel border-border text-mute hover:text-ink")
                }
              >
                Push
              </button>
            </div>

            {/* Read-out of the autopilot. Hidden when no partner choice yet. */}
            {choiceMade && state?.partnerId && (
              <div className="mt-2 text-[11px] text-mute">
                Team: <span className="text-ink">{wolf.displayName}</span>
                {" + "}
                <span className="text-ink">{playerName(state.partnerId)}</span>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-mute pt-1">
        Winner is auto-detected from logged scores once everyone&apos;s in
        on a hole. Tap Push if you want to force a push manually.
      </p>
    </div>
  );
}
