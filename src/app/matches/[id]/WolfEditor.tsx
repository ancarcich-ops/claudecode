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
};

// Sentinel value in the partner select for the lone-wolf option.
const LONE = "__LONE__";

function wolfForHole(players: Player[], hole: number): Player {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  return sorted[(hole - 1) % sorted.length];
}

export default function WolfEditor({
  sideGameId,
  holes,
  players,
  byHole,
  locked,
}: {
  sideGameId: string;
  holes: number;
  players: Player[];
  byHole: Record<number, WolfHoleState>;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send = (
    hole: number,
    kind: "PARTNER" | "LONE_WOLF" | "HOLE_WINNER",
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
    isLoneWolf: boolean,
    side: "" | "WOLF" | "OTHERS",
  ) => {
    if (side === "") {
      send(hole, "HOLE_WINNER", "");
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

  // Reconstruct "which side won" from the stored winnerId + team membership.
  const winnerSide = (
    state: WolfHoleState | undefined,
    wolf: Player,
  ): "" | "WOLF" | "OTHERS" => {
    if (!state || !state.winnerId) return "";
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
            const wolf = wolfForHole(players, h);
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
                        e.target.value as "" | "WOLF" | "OTHERS",
                      )
                    }
                    disabled={pending || locked || !choiceMade}
                    aria-label={`Hole ${h} winner`}
                    className="input h-8 py-0 px-1.5 text-xs w-full min-w-0"
                  >
                    <option value="">—</option>
                    <option value="WOLF">
                      {state?.isLoneWolf ? "Wolf won" : "Wolf team"}
                    </option>
                    <option value="OTHERS">Others</option>
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
