"use client";

// Share-my-round settings card, link-first: create a live share link
// (pace / projected finish / ETA-home / optional score) and text it to
// whoever's waiting on you. Email delivery was cut -- nobody wants
// golf email -- and SMS delivery will plug into the same rows later.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRoundShareAction,
  deleteRoundShareAction,
} from "@/lib/shareActions";

export type RoundShareRow = {
  id: string;
  matchPlayerId: string;
  recipientEmail: string | null;
  includeScores: boolean;
  milestones: string;
  destAddress: string | null;
  bufferMin: number;
  token: string;
};

export default function ShareMyRoundCard({
  matchId,
  players,
  myMatchPlayerId,
  shares,
}: {
  matchId: string;
  players: { id: string; displayName: string }[];
  myMatchPlayerId: string | null;
  shares: RoundShareRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await createRoundShareAction(fd);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  };

  const revoke = (shareId: string) => {
    const fd = new FormData();
    fd.set("shareId", shareId);
    startTransition(async () => {
      await deleteRoundShareAction(fd).catch(() => {});
      router.refresh();
    });
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/r/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const nameFor = (id: string) =>
    players.find((p) => p.id === id)?.displayName ?? "—";

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-display text-base font-semibold text-ink">
          Share my round
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-accent text-sm hover:underline"
        >
          {open ? "Close" : "+ Create link"}
        </button>
      </div>
      <p className="text-[12px] text-mute mb-3">
        A live link you can text to whoever&apos;s waiting on you — pace,
        estimated finish, ETA home, and (optionally) your score. It updates
        itself while you play.
      </p>

      {shares.length > 0 && (
        <ul className="space-y-2 mb-3">
          {shares.map((s) => (
            <li
              key={s.id}
              className="border border-border rounded-md p-2.5 flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {nameFor(s.matchPlayerId)}&apos;s round
                </div>
                <div className="text-[11px] text-mute truncate">
                  {s.includeScores ? "with score" : "no score"}
                  {s.destAddress ? ` · ETA to ${s.destAddress}` : ""}
                  {s.bufferMin > 0 ? ` · +${s.bufferMin}m cushion` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyLink(s.token)}
                  className="text-[11px] font-mono uppercase tracking-wider text-accent"
                >
                  {copied === s.token ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => revoke(s.id)}
                  className="text-[11px] font-mono uppercase tracking-wider text-danger"
                >
                  Stop
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form ref={formRef} action={submit} className="space-y-2.5">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[11px] text-mute">Whose round</span>
              <select
                name="matchPlayerId"
                defaultValue={myMatchPlayerId ?? players[0]?.id}
                className="input w-full h-9 text-sm"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-mute">
                Heading somewhere after? (for ETA — optional)
              </span>
              <input
                name="destAddress"
                type="text"
                placeholder="123 Main St, Los Angeles"
                className="input w-full h-9 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="includeScores" defaultChecked />
              Include score
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <span className="text-mute">Cushion</span>
              <select name="bufferMin" defaultValue="0" className="input h-8 text-sm">
                <option value="0">None</option>
                <option value="15">+15 min</option>
                <option value="30">+30 min</option>
                <option value="45">+45 min</option>
                <option value="60">+1 hour</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] text-faint -mt-1">
            Cushion pads the finish &amp; ETA they see — quietly. For the
            clubhouse beer.
          </p>
          {error && <p className="text-danger text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary w-full sm:w-auto disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create link"}
          </button>
        </form>
      )}
    </section>
  );
}
