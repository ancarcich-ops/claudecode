import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findGroupByIdOrSlug } from "@/lib/groups";
import { computeGroupLeaderboard } from "@/lib/leaderboard";
import LeaderboardTable from "./LeaderboardTable";
import EmptyIllustration from "@/components/EmptyIllustration";

export const dynamic = "force-dynamic";

export default async function GroupLeaderboardPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const resolved = await findGroupByIdOrSlug(params.id);
  if (!resolved) notFound();
  const group = await prisma.group.findUnique({
    where: { id: resolved.id },
    select: {
      id: true,
      name: true,
      slug: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!group) notFound();
  if (group.members.length === 0) notFound();

  const lb = await computeGroupLeaderboard(group.id);

  type ColumnDef = {
    key: keyof import("@/lib/leaderboard").LeaderboardRow;
    label: string;
    hint: string;
    show: boolean;
  };
  const columns: ColumnDef[] = [
    {
      key: "mainWins",
      label: "Main",
      hint: "Lowest net/gross",
      show: lb.hasMain,
    },
    {
      key: "stablefordWins",
      label: "Staple",
      hint: "Stableford leader",
      show: lb.hasStableford,
    },
    {
      key: "skinsWins",
      label: "Skins",
      hint: "Most skins",
      show: lb.hasSkins,
    },
    {
      key: "nassauWins",
      label: "Nassau",
      hint: "Total bet",
      show: lb.hasNassau,
    },
    { key: "bbbWins", label: "BBB", hint: "Most BBB points", show: lb.hasBbb },
    {
      key: "snakeWins",
      label: "Snake",
      hint: "Fewest 3-putts",
      show: lb.hasSnake,
    },
    {
      key: "wolfWins",
      label: "Wolf",
      hint: "Most Wolf points",
      show: lb.hasWolf,
    },
  ];
  const visible = columns.filter((c) => c.show);
  const anyWinsLogged = visible.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/groups/${group.slug ?? group.id}`}
          className="text-xs text-mute hover:text-ink"
        >
          ← {group.name}
        </Link>
        <h1 className="text-xl font-semibold mt-1">Leaderboard</h1>
        <p className="text-sm text-mute mt-1">
          {lb.completedMatches === 0
            ? "No completed matches yet. Wins start counting once rounds wrap up."
            : `${lb.completedMatches} completed match${
                lb.completedMatches === 1 ? "" : "es"
              }. Ties at the top of any game share the win.`}
        </p>
      </div>

      {!anyWinsLogged ? (
        <EmptyIllustration
          kind="noLeaderboard"
          title="No closed lines yet."
          body="Once a match in this group wraps up, wins start posting here."
        />
      ) : (
        <LeaderboardTable
          rows={lb.rows}
          meUserId={user.id}
          columns={visible.map((c) => ({
            key: c.key as
              | "mainWins"
              | "stablefordWins"
              | "skinsWins"
              | "nassauWins"
              | "bbbWins"
              | "snakeWins"
              | "wolfWins",
            label: c.label,
            hint: c.hint,
            numeric: true,
            show: c.show,
          }))}
        />
      )}

      {/* Current champions per game type */}
      {lb.champions.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
            Current champions
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lb.champions.map((c) => (
              <li
                key={c.kind}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-mute">
                    {c.label}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {c.winners.map((w) => w.displayName).join(", ")}
                  </div>
                </div>
                <div className="text-[11px] text-mute text-right shrink-0">
                  <div className="truncate max-w-[10rem]">{c.courseName}</div>
                  <div>
                    {new Date(c.scheduledAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Head-to-head matrix */}
      {lb.headToHead.users.length >= 2 && (
        <section className="card p-2 sm:p-4 overflow-x-auto">
          <h2 className="text-sm uppercase tracking-wider text-mute mb-3 px-2 pt-1">
            Head to head
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-mute">
                <th className="text-left font-medium uppercase tracking-wider text-[10px] py-2 px-2"></th>
                {lb.headToHead.users.map((u) => (
                  <th
                    key={u.userId}
                    className="text-right font-medium uppercase tracking-wider text-[10px] py-2 px-2"
                  >
                    vs {u.displayName.slice(0, 8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lb.headToHead.users.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="py-2 px-2 font-medium">{row.displayName}</td>
                  {lb.headToHead.users.map((col) => {
                    if (row.userId === col.userId) {
                      return (
                        <td
                          key={col.userId}
                          className="py-2 px-2 text-right text-mute/40 font-mono tabular-nums"
                        >
                          —
                        </td>
                      );
                    }
                    const w = lb.headToHead.wins[row.userId]?.[col.userId] ?? 0;
                    const l = lb.headToHead.wins[col.userId]?.[row.userId] ?? 0;
                    const tone =
                      w > l
                        ? "text-accent"
                        : w < l
                          ? "text-danger"
                          : "text-mute";
                    return (
                      <td
                        key={col.userId}
                        className={
                          "py-2 px-2 text-right font-mono tabular-nums " + tone
                        }
                        title={`${w} win${w === 1 ? "" : "s"}, ${l} loss${l === 1 ? "" : "es"}`}
                      >
                        {w}-{l}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Streaks */}
      {lb.streaks.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
            Main-game streaks
          </h2>
          <ul className="space-y-1">
            {lb.streaks.slice(0, 8).map((s) => (
              <li
                key={s.userId}
                className="flex items-center justify-between text-sm py-1"
              >
                <span className="truncate">{s.displayName}</span>
                <span className="font-mono tabular-nums shrink-0">
                  <span
                    className={
                      s.currentMainStreak > 0 ? "text-accent" : "text-mute"
                    }
                  >
                    {s.currentMainStreak}
                  </span>
                  <span className="text-mute"> · best {s.bestMainStreak}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Course records */}
      {lb.courseRecords.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
            Course records
          </h2>
          <ul className="space-y-1">
            {lb.courseRecords.map((c) => (
              <li
                key={c.courseName}
                className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
              >
                <span className="truncate min-w-0">{c.courseName}</span>
                <span className="font-mono tabular-nums shrink-0 text-right">
                  <div>
                    <span className="text-ink">{c.gross}</span>
                    <span className="text-mute"> · {c.bestDisplayName}</span>
                  </div>
                  <div className="text-[10px] text-mute">
                    net {c.net.toFixed(1)}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-mute">
        Only completed matches in <span className="text-ink">{group.name}</span>{" "}
        count. Players need to be linked to a Sticks account to appear here —
        hand-typed guest names don&apos;t.
      </p>
    </div>
  );
}
