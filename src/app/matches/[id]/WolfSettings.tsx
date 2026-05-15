"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWolfConfigAction } from "@/lib/actions";

type Player = { id: string; displayName: string; seat: number };

export default function WolfSettings({
  sideGameId,
  players,
  rotation,
  pushRule,
  locked,
}: {
  sideGameId: string;
  players: Player[];
  // Initial rotation: ordered list of matchPlayerId. Empty array means
  // use the seat-order default; we render that explicitly so the user
  // can edit and save.
  rotation: string[];
  pushRule: "NO_POINTS" | "ROLLOVER";
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const seatOrder = [...players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => p.id);
  // Internal state of the rotation. Default to seat order if config is empty.
  const [order, setOrder] = useState<string[]>(
    rotation.length === seatOrder.length ? rotation : seatOrder,
  );
  const [rule, setRule] = useState<"NO_POINTS" | "ROLLOVER">(pushRule);

  const byId = new Map(players.map((p) => [p.id, p]));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };
  const resetOrder = () => setOrder(seatOrder);

  const isCustomOrder =
    order.join(",") !== seatOrder.join(",");
  const dirty = isCustomOrder || rule !== pushRule;

  const save = () => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("pushRule", rule);
    // Send empty rotation when it matches the default so the server can
    // clear any prior override.
    fd.set("rotation", isCustomOrder ? order.join(",") : "");
    startTransition(async () => {
      await updateWolfConfigAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-mute mb-2">
          Wolf rotation
        </div>
        <ul className="space-y-1.5">
          {order.map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <li
                key={id}
                className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5"
              >
                <span className="w-6 text-xs font-mono tabular-nums text-mute text-right shrink-0">
                  {i + 1}.
                </span>
                <span className="flex-1 text-sm truncate">{p.displayName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={locked || pending || i === 0}
                    aria-label={`Move ${p.displayName} up`}
                    className="btn btn-ghost h-7 w-7 px-0 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={
                      locked || pending || i === order.length - 1
                    }
                    aria-label={`Move ${p.displayName} down`}
                    className="btn btn-ghost h-7 w-7 px-0 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={resetOrder}
            disabled={locked || pending || !isCustomOrder}
            className="btn btn-ghost text-xs disabled:opacity-30"
          >
            Reset to seat order
          </button>
          <span className="text-[11px] text-mute">
            Wolf for hole N is row ((N − 1) mod {order.length}) + 1.
          </span>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-mute mb-2">
          Push handling
        </div>
        <div className="space-y-1.5">
          <PushOption
            current={rule}
            value="NO_POINTS"
            onSelect={setRule}
            disabled={locked || pending}
            label="No points"
            blurb="Pushed holes award nothing; move on to the next."
          />
          <PushOption
            current={rule}
            value="ROLLOVER"
            onSelect={setRule}
            disabled={locked || pending}
            label="Rollover"
            blurb="Pushed-hole stakes carry. Next resolved hole pays 2x, 3x, etc."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={save}
          disabled={locked || pending || !dirty}
          className="btn btn-primary text-xs disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PushOption({
  current,
  value,
  onSelect,
  disabled,
  label,
  blurb,
}: {
  current: "NO_POINTS" | "ROLLOVER";
  value: "NO_POINTS" | "ROLLOVER";
  onSelect: (v: "NO_POINTS" | "ROLLOVER") => void;
  disabled: boolean;
  label: string;
  blurb: string;
}) {
  const active = current === value;
  return (
    <label
      className={
        "flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors " +
        (disabled
          ? "opacity-60 cursor-not-allowed border-border"
          : active
            ? "border-accent/50 bg-accent/5"
            : "border-border hover:border-accent/30")
      }
    >
      <input
        type="radio"
        name="pushRule"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        disabled={disabled}
        className="mt-0.5 shrink-0 accent-accent"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-mute">{blurb}</div>
      </div>
    </label>
  );
}
