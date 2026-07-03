"use client";

// Share-my-round settings card. Lives under the scorecard for seated
// players: add a recipient (email + milestones + optional destination
// for ETA-home), see active shares, copy the live link, revoke.

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
          {open ? "Close" : "+ Add recipient"}
        </button>
      </div>
      <p className="text-[12px] text-mute mb-3">
        Email someone updates while you play — pace, estimated finish, and
        (optionally) your score, plus a live link they can follow.
      </p>

      {shares.length > 0 && (
        <ul className="space-y-2 mb-3">
          {shares.map((s) => (
            <li
              key={s.id}
              className="border border-border rounded-md p-2.5 flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{s.recipientEmail}</div>
                <div className="text-[11px] text-mute truncate">
                  {nameFor(s.matchPlayerId)} ·{" "}
                  {s.milestones
                    .split(",")
                    .map((m) =>
                      m === "FRONT9"
                        ? "after 9"
                        : m === "EVERY6"
                          ? "every 6"
                          : "finish",
                    )
                    .join(" + ")}
                  {s.includeScores ? " · with score" : " · no score"}
                  {s.destAddress ? " · ETA on" : ""}
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
              <span className="text-[11px] text-mute">Their email</span>
              <input
                name="recipientEmail"
                type="email"
                required
                placeholder="wife@example.com"
                className="input w-full h-9 text-sm"
              />
            </label>
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
          </div>
          <label className="block">
            <span className="text-[11px] text-mute">
              Heading somewhere after? (address for ETA — optional)
            </span>
            <input
              name="destAddress"
              type="text"
              placeholder="123 Main St, Los Angeles"
              className="input w-full h-9 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="milestones" value="FRONT9" defaultChecked />
              After 9
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="milestones" value="EVERY6" />
              Every 6
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="milestones" value="FINISH" defaultChecked />
              When done
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="includeScores" defaultChecked />
              Include score
            </label>
          </div>
          {error && <p className="text-danger text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary w-full sm:w-auto disabled:opacity-60"
          >
            {pending ? "Saving…" : "Start sharing"}
          </button>
        </form>
      )}
    </section>
  );
}
