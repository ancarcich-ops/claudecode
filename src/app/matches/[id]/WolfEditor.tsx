"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string; seat: number };

// Pre-shaped per-hole state from the server.
type WolfHoleState = {
  hole: number;
  partnerId: string | null;
  isLoneWolf: boolean;
  winnerId: string | null;
  isPush: boolean;
};

// Sentinel value in the partner select for the lone-wolf option.
const LONE = "__LONE__";

function wolfForHole(
  players: Player[],
  hole: number,
  rotation?: string[],
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
  return ordered[(hole - 1) % ordered.length];
}

export default function WolfEditor({
  sideGameId,
  holes,
  players,
  byHole,
  rotation,
  locked,
}: {
  sideGameId: string;
  holes: number;
  players: Player[];
  byHole: Record<number, WolfHoleState>;
  // Optional custom rotation (matchPlayerId list). Empty array = use seat
  // order, same as runtime default.
  rotation: string[];
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send = (
    hole: number,
    kind: "PARTNER" | "LONE_WOLF" | "HOLE_WINNER" | "PUSH",
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

  const onPartnerChange = (
    hole: number,
    wolf: Player,
    value: string,
  ) => {
    if (value === "") {
      // Clear by sending PARTNER with empty player; action will wipe both
      // PARTNER and LONE_WOLF rows for this hole.
      send(hole, "PARTNER", "");
    } else if (value === LONE) {
      send(hole, "LONE_WOLF", wolf.id);
    } else {
      send(hole, "PARTNER", value);
    }
  };

  const onWinnerChange = (
    hole: number,
    wolf: Player,
    partnerId: string | null,
    _isLoneWolf: boolean,
    side: "" | "WOLF" | "OTHERS" | "PUSH",
  ) => {
    if (side === "") {
      // Clear both kinds by sending HOLE_WINNER with no player; the action
      // wipes both HOLE_WINNER and PUSH for the hole.
      send(hole, "HOLE_WINNER", "");
      return;
    }
    if (side === "PUSH") {
      send(hole, "PUSH", "");
      return;
    }
    if (side === "WOLF") {
      // Store the Wolf's id as the team representative.
      send(hole, "HOLE_WINNER", wolf.id);
      return;
    }
    // Others: pick any non-Wolf, non-partner player as the representative.
    const opponents = players.filter(
      (p) => p.id !== wolf.id && p.id !== partnerId,
    );
    if (opponents.length === 0) return;
    send(hole, "HOLE_WINNER", opponents[0].id);
  };

  // Reconstruct "which side won" (or pushed) from the stored events.
  const winnerSide = (
    state: WolfHoleState | undefined,
    wolf: Player,
  ): "" | "WOLF" | "OTHERS" | "PUSH" => {
    if (!state) return "";
    if (state.isPush) return "PUSH";
    if (!state.winnerId) return "";
    const wolfTeam = new Set<string>([wolf.id]);
    if (state.partnerId) wolfTeam.add(state.partnerId);
    return wolfTeam.has(state.winnerId) ? "WOLF" : "OTHERS";
  };

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-mute">
            <th className="text-left font-medium uppercase tracking-wider py-1.5 pr-2 w-12">
              Hole
            </th>
            <th className="text-left font-medium uppercase tracking-wider py-1.5 px-1.5">
              Wolf
            </th>
            <th className="text-left font-medium uppercase tracking-wider py-1.5 px-1.5">
              Partner
            </th>
            <th className="text-left font-medium uppercase tracking-wider py-1.5 px-1.5">
              Winner
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: holes }, (_, i) => i + 1).map((h) => {
            const wolf = wolfForHole(players, h, rotation);
            const state = byHole[h];
            const partnerValue = state?.isLoneWolf
              ? LONE
              : state?.partnerId ?? "";
            const winner = winnerSide(state, wolf);
            const choiceMade =
              !!state && (state.isLoneWolf || !!state.partnerId);

            return (
              <tr key={h} className="border-t border-border">
                <td className="py-1.5 pr-2 font-mono tabular-nums text-mute">
                  {h}
                </td>
                <td className="py-1.5 px-1.5 truncate">{wolf.displayName}</td>
                <td className="py-1 px-1.5">
                  <select
                    value={partnerValue}
                    onChange={(e) => onPartnerChange(h, wolf, e.target.value)}
                    disabled={pending || locked}
                    aria-label={`Wolf partner choice on hole ${h}`}
                    className="input h-8 py-0 px-1.5 text-xs w-full min-w-0"
                  >
                    <option value="">—</option>
                    <option value={LONE}>Lone Wolf</option>
                    {/* In 3-player Wolf the wolf always goes solo --
                       partner picks aren't allowed. Hide opponents from
                       the select for that case. */}
                    {players.length !== 3 &&
                      players
                        .filter((p) => p.id !== wolf.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                  </select>
                </td>
                <td className="py-1 px-1.5">
                  <select
                    value={winner}
                    onChange={(e) =>
                      onWinnerChange(
                        h,
                        wolf,
                        state?.partnerId ?? null,
                        state?.isLoneWolf ?? false,
                        e.target.value as "" | "WOLF" | "OTHERS" | "PUSH",
                      )
                    }
                    // Push is a valid outcome even without a Wolf-choice
                    // (e.g. abandoned hole), so always allow Push;
                    // Wolf-team / Others still need a choice first.
                    disabled={pending || locked}
                    aria-label={`Hole ${h} winner`}
                    className="input h-8 py-0 px-1.5 text-xs w-full min-w-0"
                  >
                    <option value="">—</option>
                    <option value="WOLF" disabled={!choiceMade}>
                      {state?.isLoneWolf ? "Wolf won" : "Wolf team"}
                    </option>
                    <option value="OTHERS" disabled={!choiceMade}>
                      Others
                    </option>
                    <option value="PUSH">Push</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
