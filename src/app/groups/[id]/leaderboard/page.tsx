import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeGroupLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export default async function GroupLeaderboardPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!group) notFound();
  // Membership gate: only members of the group can see its leaderboard.
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
          href={`/groups/${group.id}`}
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
        <div className="card p-6 text-sm text-mute">
          Once a match in this group finishes, the leaderboard fills in.
        </div>
      ) : (
        <div className="card p-1 sm:p-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-mute">
                <th className="text-left font-medium uppercase tracking-wider text-[10px] py-2 px-2 sticky left-0 bg-panel">
                  Player
                </th>
                <th
                  className="text-right font-medium uppercase tracking-wider text-[10px] py-2 px-2"
                  title="Total matches played"
                >
                  GP
                </th>
                {visible.map((c) => (
                  <th
                    key={String(c.key)}
                    className="text-right font-medium uppercase tracking-wider text-[10px] py-2 px-2"
                    title={c.hint}
                  >
                    {c.label}
                  </th>
                ))}
                <th
                  className="text-right font-medium uppercase tracking-wider text-[10px] py-2 px-2 text-accent"
                  title="Total wins across all game types"
                >
                  All
                </th>
              </tr>
            </thead>
            <tbody>
              {lb.rows.map((r) => {
                const isYou = r.userId === user.id;
                const displayName = r.displayName ?? r.username;
                return (
                  <tr
                    key={r.userId}
                    className="border-t border-border hover:bg-panel2/30"
                  >
                    <td className="py-2 px-2 sticky left-0 bg-panel">
                      <div className="font-medium truncate max-w-[10rem]">
                        {displayName}
                        {isYou && (
                          <span className="text-mute font-normal"> (you)</span>
                        )}
                      </div>
                      <div className="text-[10px] text-mute truncate">
                        @{r.username}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-mute">
                      {r.matchesPlayed}
                    </td>
                    {visible.map((c) => {
                      const v = r[c.key] as number;
                      return (
                        <td
                          key={String(c.key)}
                          className={
                            "py-2 px-2 text-right font-mono tabular-nums " +
                            (v === 0 ? "text-mute/40" : "")
                          }
                        >
                          {v}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-accent">
                      {r.totalWins}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-mute">
        Only completed matches in <span className="text-ink">{group.name}</span>{" "}
        count. Players need to be linked to a Sticks account to appear here —
        hand-typed guest names don&apos;t.
      </p>
    </div>
  );
}
