"use client";

// Group leaderboard — redesigned per the "Leaderboard Redesign"
// handoff (Caddie's Notebook): medal-ranked standings with a Sort
// segmented control, a Latest-winners champions card, a bounded
// horizontally-scrolling head-to-head matrix with a sticky name
// column + edge fade, flame-tile streaks, and course records.
// Tokens map to theme vars; medal metals are literal (brand-neutral).

import { useMemo, useRef, useState } from "react";
import PlayerAvatar, { isVariant, type AvatarVariant } from "@/components/Avatar";
import type {
  LeaderboardRow,
  HeadToHead,
  GroupChampion,
  StreakRow,
  CourseRecord,
} from "@/lib/leaderboard";

const MEDALS = [
  "radial-gradient(circle at 35% 30%, #e6c98e, #b98a2f)", // gold
  "radial-gradient(circle at 35% 30%, #dcd6c8, #a8a08c)", // silver
  "radial-gradient(circle at 35% 30%, #d9a878, #a5713f)", // bronze
];

// Identity color per user — same FNV-1a + palette as group spines so a
// player keeps one color across the app.
const IDENTITY_COLORS = [
  "rgb(var(--color-accent))",
  "rgb(var(--color-gold))",
  "#324A63",
  "rgb(var(--color-danger))",
  "#9B5A6B",
];
function identityColor(id: string): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(id)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return IDENTITY_COLORS[Number(h % BigInt(IDENTITY_COLORS.length))];
}

type SortKey = "all" | "main" | "skins" | "gp";
const SORT_SEGMENTS: { key: SortKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "main", label: "Main" },
  { key: "skins", label: "Skins" },
  { key: "gp", label: "Played" },
];

function sortValue(r: LeaderboardRow, k: SortKey): number {
  switch (k) {
    case "all":
      return r.totalWins;
    case "main":
      return r.mainWins;
    case "skins":
      return r.skinsWins;
    case "gp":
      return r.matchesPlayed;
  }
}

function SectionHead({
  title,
  caption,
}: {
  title: string;
  caption?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mt-7 mb-2.5 px-0.5">
      <h2 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {caption && (
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-faint">
          {caption}
        </span>
      )}
    </div>
  );
}

const CARD_CLS =
  "rounded-[16px] border border-border bg-panel overflow-hidden";

function Medal({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className="w-[22px] h-[22px] rounded-full grid place-items-center font-mono text-[11px] font-medium text-white shrink-0"
        style={{ background: MEDALS[rank - 1] }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="w-[22px] text-center font-mono text-[12px] text-faint shrink-0">
      {rank}
    </span>
  );
}

function Avatar({
  row,
  size,
}: {
  row: Pick<LeaderboardRow, "userId" | "displayName" | "username" | "avatarSeed" | "avatarVariant" | "avatarUrl">;
  size: number;
}) {
  const variant: AvatarVariant =
    row.avatarVariant && isVariant(row.avatarVariant)
      ? (row.avatarVariant as AvatarVariant)
      : "beam";
  return (
    <span
      className="rounded-full overflow-hidden shrink-0 inline-block"
      style={{ width: size, height: size }}
    >
      <PlayerAvatar
        seed={row.avatarSeed ?? row.displayName ?? row.username}
        variant={variant}
        avatarUrl={row.avatarUrl ?? null}
        size={size}
      />
    </span>
  );
}

export default function LeaderboardRedesign({
  rows,
  headToHead,
  champions,
  streaks,
  courseRecords,
}: {
  rows: LeaderboardRow[];
  headToHead: HeadToHead;
  champions: GroupChampion[];
  streaks: StreakRow[];
  courseRecords: CourseRecord[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("all");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const d = sortValue(b, sortKey) - sortValue(a, sortKey);
      if (d !== 0) return d;
      if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
      if (b.matchesPlayed !== a.matchesPlayed)
        return b.matchesPlayed - a.matchesPlayed;
      return (a.displayName ?? a.username).localeCompare(
        b.displayName ?? b.username,
      );
    });
  }, [rows, sortKey]);

  // Champions card shows the belts the design calls out: Main + Skins.
  const featured = champions.filter(
    (c) => c.kind === "MAIN" || c.kind === "SKINS",
  );

  // Head-to-head edge fade: hidden once scrolled to the end.
  const h2hRef = useRef<HTMLDivElement>(null);
  const [fadeVisible, setFadeVisible] = useState(true);
  const onH2hScroll = () => {
    const el = h2hRef.current;
    if (!el) return;
    setFadeVisible(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  const metricCell = (value: number, on: boolean) => (
    <span
      className={
        "text-center font-mono text-[15px] tabular-nums " +
        (value === 0
          ? "text-faint opacity-50"
          : on
            ? "text-accent font-medium"
            : "text-ink")
      }
    >
      {value}
    </span>
  );

  return (
    <>
      {/* ===== Latest winners ===== */}
      {featured.length > 0 && (
        <>
          <section className={CARD_CLS + " mt-5"}>
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-1">
              <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center bg-gold/[0.14] text-gold">
                <TrophyIcon size={15} />
              </span>
              <h2 className="font-display text-[18px] font-semibold text-ink">
                Latest winners
              </h2>
            </div>
            {featured.map((c, i) => (
              <div
                key={c.kind}
                className={
                  "flex items-center gap-3 px-4 py-3 " +
                  (i > 0 ? "border-t border-borderSoft" : "")
                }
              >
                <div className="w-[74px] shrink-0">
                  <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-faint">
                    {c.kind === "MAIN" ? "Main game" : "Skins"}
                  </div>
                  <div className="font-mono text-[10px] text-mute truncate mt-0.5">
                    {c.courseName.split(" ").slice(0, 2).join(" ")}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-[19px] text-ink truncate">
                    {c.winners.map((w, wi) => (
                      <span key={wi}>
                        {wi > 0 && (
                          <span className="text-faint font-medium"> &amp; </span>
                        )}
                        {w.displayName}
                      </span>
                    ))}
                  </div>
                  <div className="font-mono text-[10.5px] text-mute truncate mt-0.5">
                    {c.winners.length > 1 ? "Shared win · " : ""}
                    {c.courseName}
                  </div>
                </div>
                <span
                  className="w-[34px] h-[34px] rounded-full grid place-items-center text-white shrink-0"
                  style={{ background: MEDALS[0] }}
                >
                  <TrophyIcon size={15} />
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      {/* ===== Standings ===== */}
      <SectionHead title="Standings" />
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-faint mr-1">
          Sort
        </span>
        {SORT_SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSortKey(s.key)}
            className={
              "h-[30px] px-3 rounded-[10px] font-sans font-semibold text-[12px] transition-colors " +
              (sortKey === s.key
                ? "bg-accent text-ink-on-accent"
                : "bg-panel2 text-mute border border-border")
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <section className={CARD_CLS}>
        <div
          className="grid items-center gap-x-1 px-3 py-2"
          style={{ gridTemplateColumns: "26px 1fr repeat(4, 34px)" }}
        >
          <span />
          <span className="font-mono text-[8.5px] tracking-[0.1em] uppercase text-faint">
            Player
          </span>
          {(
            [
              ["GP", "gp"],
              ["Main", "main"],
              ["Skins", "skins"],
              ["All", "all"],
            ] as const
          ).map(([label, key]) => (
            <span
              key={key}
              className={
                "text-center font-mono text-[8.5px] tracking-[0.1em] uppercase " +
                (sortKey === key ? "text-accent" : "text-faint")
              }
            >
              {label}
            </span>
          ))}
        </div>
        {sorted.map((r, i) => (
          <div
            key={r.userId}
            className={
              "grid items-center gap-x-1 px-3 py-[11px] " +
              (i === 0
                ? ""
                : "border-t border-borderSoft ")
            }
            style={{
              gridTemplateColumns: "26px 1fr repeat(4, 34px)",
              background:
                i === 0
                  ? "linear-gradient(90deg, rgb(var(--color-gold) / 0.10), transparent 70%)"
                  : undefined,
            }}
          >
            <Medal rank={i + 1} />
            <span className="flex items-center gap-2.5 min-w-0 pl-1">
              <Avatar row={r} size={34} />
              <span className="min-w-0">
                <span className="block font-sans font-bold text-[14.5px] text-ink truncate leading-tight">
                  {r.displayName ?? r.username}
                </span>
                <span className="block font-mono text-[10.5px] text-faint truncate">
                  @{r.username}
                </span>
              </span>
            </span>
            {metricCell(r.matchesPlayed, sortKey === "gp")}
            {metricCell(r.mainWins, sortKey === "main")}
            {metricCell(r.skinsWins, sortKey === "skins")}
            {metricCell(r.totalWins, sortKey === "all")}
          </div>
        ))}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-borderSoft">
          <InfoIcon />
          <span className="font-mono text-[10.5px] text-faint">
            Only Sticks-linked players appear — guest names don&apos;t count.
          </span>
        </div>
      </section>

      {/* ===== Head to head ===== */}
      {headToHead.users.length >= 2 && (
        <>
          <SectionHead title="Head to head" />
          <section className={CARD_CLS + " relative"}>
            <div
              ref={h2hRef}
              onScroll={onH2hScroll}
              className="overflow-x-auto no-scrollbar"
            >
              <table className="border-collapse min-w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-panel z-10 px-3 py-2 text-left" />
                    {headToHead.users.map((u) => (
                      <th key={u.userId} className="px-2.5 py-2 text-center min-w-[54px]">
                        <div className="font-mono text-[8px] tracking-[0.1em] uppercase text-faint">
                          vs
                        </div>
                        <div className="font-sans font-bold text-[11px] text-mute truncate max-w-[70px]">
                          {u.displayName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {headToHead.users.map((row, ri) => (
                    <tr
                      key={row.userId}
                      className={ri % 2 === 0 ? "bg-accent/[0.04]" : ""}
                    >
                      <td className="sticky left-0 bg-panel z-10 px-3 h-[44px] font-sans font-semibold text-[12.5px] text-ink whitespace-nowrap border-t border-borderSoft">
                        {row.displayName}
                      </td>
                      {headToHead.users.map((col) => {
                        if (row.userId === col.userId) {
                          return (
                            <td
                              key={col.userId}
                              className="text-center font-mono text-[13px] text-faint/50 border-t border-borderSoft"
                            >
                              —
                            </td>
                          );
                        }
                        const w = headToHead.wins[row.userId]?.[col.userId] ?? 0;
                        const l = headToHead.wins[col.userId]?.[row.userId] ?? 0;
                        const tone =
                          w > l
                            ? "text-accent"
                            : l > w
                              ? "text-danger"
                              : "text-faint";
                        return (
                          <td
                            key={col.userId}
                            className={
                              "text-center font-mono text-[13px] tabular-nums border-t border-borderSoft " +
                              tone
                            }
                            title={`${w} win${w === 1 ? "" : "s"}, ${l} loss${l === 1 ? "" : "es"}`}
                          >
                            {w}–{l}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fadeVisible && (
              <span
                aria-hidden
                className="pointer-events-none absolute right-0 top-0 bottom-0 w-10"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgb(var(--color-panel)))",
                }}
              />
            )}
          </section>
          <div className="text-right font-mono text-[10px] text-faint mt-1.5 pr-1">
            Swipe to see all rivals →
          </div>
        </>
      )}

      {/* ===== Main-game streaks ===== */}
      {streaks.length > 0 && (
        <>
          <SectionHead title="Main-game streaks" />
          <section className={CARD_CLS}>
            {streaks.slice(0, 8).map((s, i) => {
              const hot = s.currentMainStreak > 0;
              return (
                <div
                  key={s.userId}
                  className={
                    "flex items-center gap-3 px-4 py-3 " +
                    (i > 0 ? "border-t border-borderSoft" : "")
                  }
                >
                  <span
                    className={
                      "w-[30px] h-[30px] rounded-[9px] grid place-items-center shrink-0 " +
                      (hot ? "bg-danger/10 text-danger" : "bg-panel2 text-faint")
                    }
                  >
                    <FlameIcon />
                  </span>
                  <span className="flex-1 font-sans font-semibold text-[14.5px] text-ink truncate">
                    {s.displayName}
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span
                      className={
                        "font-display font-bold text-[22px] tabular-nums " +
                        (hot ? "text-danger" : "text-mute")
                      }
                    >
                      {s.currentMainStreak}
                    </span>
                    <span className="font-mono text-[10.5px] text-faint">
                      best {s.bestMainStreak}
                    </span>
                  </span>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* ===== Course records ===== */}
      {courseRecords.length > 0 && (
        <>
          <SectionHead title="Course records" />
          <section className={CARD_CLS}>
            {courseRecords.map((c, i) => (
              <div
                key={c.courseName}
                className={
                  "flex items-center gap-3 px-4 py-3 " +
                  (i > 0 ? "border-t border-borderSoft" : "")
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-semibold text-[14px] text-ink truncate">
                    {c.courseName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      aria-hidden
                      className="w-[7px] h-[7px] rounded-full shrink-0"
                      style={{ background: identityColor(c.bestUserId) }}
                    />
                    <span className="font-mono text-[10.5px] text-faint truncate">
                      {c.bestDisplayName}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display font-bold text-[22px] leading-tight text-ink tabular-nums">
                    {c.gross}
                  </div>
                  <div className="font-mono text-[10.5px] text-faint">
                    net {c.net.toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function TrophyIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 17 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 2.5h7v3a3.5 3.5 0 0 1-7 0v-3Z" />
      <path d="M5 3.5H3a2.5 2.5 0 0 0 2.4 3M12 3.5h2a2.5 2.5 0 0 1-2.4 3M8.5 9v2.5M5.5 14.5h6M6.5 11.5h4v3h-4z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 13.5c2.6 0 4.3-1.7 4.3-4.1 0-1.9-1.2-3.2-2.2-4.4C8.7 3.9 8 2.8 8 1.5c-2 1.3-2.7 3-2.4 4.6C4.4 6 4 5.4 3.9 4.6c-.9 1.1-1.7 2.6-1.7 4.3 0 2.9 2.2 4.6 5.3 4.6Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="rgb(var(--color-faint))"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="shrink-0"
    >
      <circle cx="6" cy="6" r="5" />
      <path d="M6 5.5V8.5M6 3.6v.1" />
    </svg>
  );
}
