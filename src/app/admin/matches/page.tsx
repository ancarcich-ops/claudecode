import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  adminDeleteMatchAction,
  adminSetMatchStatusAction,
} from "@/lib/actions";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

const STATUSES = ["UPCOMING", "IN_PROGRESS", "COMPLETED"] as const;

export default async function AdminMatchesPage() {
  const matches = await prisma.match.findMany({
    orderBy: { scheduledAt: "desc" },
    include: {
      createdBy: { select: { username: true } },
      players: { select: { id: true, displayName: true } },
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Matches</h1>
        <p className="text-[12px] text-mute mt-1">
          Force-delete sloppy / abandoned / duplicate matches. This bypasses
          the createdBy check.
        </p>
      </div>

      <ul className="divide-y divide-border border border-border rounded-md">
        {matches.length === 0 && (
          <li className="px-3 py-2 text-[12px] text-mute">No matches.</li>
        )}
        {matches.map((m) => {
          const flags: string[] = [];
          if (m.players.length < 2) flags.push("solo");
          if (m.status === "UPCOMING") flags.push("upcoming");
          return (
            <li
              key={m.id}
              className="px-3 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/matches/${m.id}`}
                    className="text-sm font-medium truncate hover:text-accent"
                  >
                    {m.courseName}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wider text-mute">
                    {m.status}
                  </span>
                  {flags.map((f) => (
                    <span
                      key={f}
                      className="text-[10px] uppercase tracking-wider text-mute bg-panel2 border border-border rounded px-1.5 py-0.5"
                    >
                      {f}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-mute mt-0.5">
                  {formatDate(m.scheduledAt)} ·{" "}
                  {m.createdBy?.username ?? "?"} · {m.players.length}{" "}
                  {m.players.length === 1 ? "player" : "players"} ·{" "}
                  {m.players.map((p) => p.displayName).join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {STATUSES.filter((s) => s !== m.status).map((s) => (
                  <form
                    key={s}
                    action={adminSetMatchStatusAction}
                  >
                    <input type="hidden" name="matchId" value={m.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      className="btn btn-ghost h-7 text-[11px] px-2"
                      title={`Mark ${s.toLowerCase().replace("_", " ")}`}
                    >
                      {s === "UPCOMING"
                        ? "→ Upcoming"
                        : s === "IN_PROGRESS"
                          ? "→ Live"
                          : "→ Complete"}
                    </button>
                  </form>
                ))}
                <form action={adminDeleteMatchAction}>
                  <input type="hidden" name="matchId" value={m.id} />
                  <button
                    type="submit"
                    className="btn btn-danger h-7 text-[11px]"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
