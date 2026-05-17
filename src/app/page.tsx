import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeOdds, formatPct, parseParData } from "@/lib/odds";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, visibleMatchWhere } from "@/lib/groups";
import AutoRefresh from "@/components/AutoRefresh";
import CourseSeeder from "@/components/CourseSeeder";
import LiveCardStats from "@/components/LiveCardStats";
import MatchCard from "@/components/match-card/MatchCard";
import { buildMatchCardData } from "@/lib/matchCard";
import { StaggerGroup, StaggerItem } from "@/components/Stagger";
import EmptyIllustration from "@/components/EmptyIllustration";
import PlayerAvatar from "@/components/Avatar";
import {
  computeStableford,
  computeSkins,
  isSideGameKind,
  type SideGameKind,
} from "@/lib/sideGames";

export const dynamic = "force-dynamic";

type GridMatch = Awaited<ReturnType<typeof loadMatches>>[number];

async function loadMatches(where: any, orderBy: any, take?: number) {
  return prisma.match.findMany({
    where,
    orderBy,
    take,
    include: {
      players: {
        orderBy: { seat: "asc" },
        include: {
          scores: true,
          _count: { select: { wagers: true } },
          // Pull the player-user's avatar customization so cards can
          // render the real photo / picked variant, not just the default
          // seeded boring-avatar.
          user: {
            select: {
              id: true,
              username: true,
              avatarSeed: true,
              avatarVariant: true,
              avatarUrl: true,
            },
          },
        },
      },
      _count: { select: { wagers: true } },
      sideGames: true,
    },
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const activeGroupId = getActiveGroupId();
  const groupWhere = await visibleMatchWhere(user?.id ?? null, activeGroupId);

  const open = await loadMatches(
    { ...groupWhere, status: { in: ["UPCOMING", "IN_PROGRESS"] } },
    [{ status: "asc" }, { scheduledAt: "asc" }],
  );
  const live = open.filter((m) => m.status === "IN_PROGRESS");
  const upcoming = open.filter((m) => m.status === "UPCOMING");

  const completed = await loadMatches(
    { ...groupWhere, status: "COMPLETED" },
    { completedAt: "desc" },
    6,
  );

  // Pull next-hole OSM geometry for every match in view, in one batched
  // query, so the peek panel on LIVE / UPCOMING cards draws the actual
  // hole shape instead of the generic placeholder curve.
  const courseHoleMap = await loadNextHoleGeo([...live, ...upcoming]);
  // Any course on the grid we don't have geo for yet -> hand off to a
  // client component that POSTs to /api/courses/seed in the background.
  // The next AutoRefresh tick after the seed completes picks up the
  // new geometry on its own.
  const unmappedCourses = uniqueUnmapped(
    [...live, ...upcoming],
    courseHoleMap,
  );

  return (
    <div className="space-y-10">
      <AutoRefresh endpoint="/api/markets/state" />
      <CourseSeeder courses={unmappedCourses} />
      {!user && (
        <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              All your games.{" "}
              <span className="text-accent">One round.</span>
            </h2>
            <p className="text-sm text-mute mt-2">
              Wolf, Skins, Bingo Bango Bongo — same scorecard.
            </p>
          </div>
          <Link
            href="/login"
            className="btn btn-primary shrink-0 self-start sm:self-auto"
          >
            Open the line →
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <SectionHeader
            title="Live now"
            accent
            count={live.length}
          />
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {live.map((m) => (
              <StaggerItem key={m.id}>
                <RenderedMatchCard match={m} courseHoleMap={courseHoleMap} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>
      )}

      <section>
        <SectionHeader title="Upcoming" />
        {upcoming.length === 0 && live.length === 0 ? (
          <EmptyIllustration
            kind="noMatches"
            title="Quiet Saturday."
            body="No rounds on the board yet. Post a tee time so the market opens."
            action={
              user ? (
                <Link className="btn btn-primary text-sm" href="/matches/new">
                  Post a round →
                </Link>
              ) : (
                <Link className="btn btn-primary text-sm" href="/login">
                  Sign in to post →
                </Link>
              )
            }
          />
        ) : upcoming.length === 0 ? (
          <EmptyCard>Nothing on the tee. Open the next line.</EmptyCard>
        ) : (
          <MatchGridNew matches={upcoming} courseHoleMap={courseHoleMap} />
        )}
      </section>

      <section>
        <SectionHeader title="Settled" />
        {completed.length === 0 ? (
          <EmptyCard>No closed lines yet.</EmptyCard>
        ) : (
          <MatchGridNew matches={completed} courseHoleMap={courseHoleMap} />
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  accent,
  count,
}: {
  title: string;
  accent?: boolean;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {accent && (
        <span
          className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse"
          aria-hidden
        />
      )}
      <h2
        className={
          "text-sm uppercase tracking-wider " +
          (accent ? "text-accent font-medium" : "text-mute")
        }
      >
        {title}
      </h2>
      {typeof count === "number" && (
        <span className="text-xs text-mute">{count}</span>
      )}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-sm text-mute">{children}</div>;
}


// Shared bridge between the prisma row and the redesigned MatchCard.
// We compute odds once and feed the normalized data through.
function buildCardData(
  m: GridMatch,
  courseHoleMap: NextHoleGeoMap,
) {
  const pars = parseParData(m.parData, m.holes);
  const scoringMode = m.scoringMode as "NET" | "GROSS" | "CUSTOM";
  const startingHole = m.startingHole ?? 1;
  const odds = computeOdds({
    status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: m.holes,
    startingHole,
    pars,
    scoringMode,
    players: m.players.map((p) => ({
      id: p.id,
      handicap: p.handicap,
      wagerCount: p._count.wagers,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    })),
  });
  // Determine which hole counts as "next" and look up its geometry.
  let maxLogged = 0;
  for (const p of m.players)
    for (const s of p.scores) if (s.hole > maxLogged) maxLogged = s.hole;
  const lastHole = startingHole + m.holes - 1;
  const nextHole = Math.min(maxLogged + 1, lastHole);
  const geo =
    courseHoleMap.get(`${m.courseName}::${nextHole}`) ?? null;

  return buildMatchCardData(
    {
      ...m,
      players: m.players.map((p) => ({
        ...p,
        user: p.user
          ? {
              username: p.user.username,
              avatarSeed: p.user.avatarSeed,
              avatarVariant: p.user.avatarVariant,
              avatarUrl: p.user.avatarUrl,
            }
          : null,
      })),
    },
    odds.probabilities,
    geo,
  );
}

function RenderedMatchCard({
  match,
  courseHoleMap,
}: {
  match: GridMatch;
  courseHoleMap: NextHoleGeoMap;
}) {
  return <MatchCard data={buildCardData(match, courseHoleMap)} />;
}

function MatchGridNew({
  matches,
  courseHoleMap,
}: {
  matches: GridMatch[];
  courseHoleMap: NextHoleGeoMap;
}) {
  return (
    <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map((m) => (
        <StaggerItem key={m.id}>
          <RenderedMatchCard match={m} courseHoleMap={courseHoleMap} />
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}

// One batched query: for each match in view, pull its course's CourseHole
// rows (tee + green coords + fairway polygon). Keyed by "<courseName>::<hole>"
// so the per-card lookup is a Map.get.
type NextHoleGeoMap = Map<string, import("@/lib/matchCard").HoleGeoLite>;

async function loadNextHoleGeo(matches: GridMatch[]): Promise<NextHoleGeoMap> {
  const courseNames = Array.from(new Set(matches.map((m) => m.courseName)));
  if (courseNames.length === 0) return new Map();
  const holes = await prisma.courseHole.findMany({
    where: { course: { name: { in: courseNames } } },
    select: {
      hole: true,
      teeLat: true,
      teeLng: true,
      greenLat: true,
      greenLng: true,
      fairwayPolygonJson: true,
      distanceYds: true,
      course: { select: { name: true } },
    },
  });
  const map: NextHoleGeoMap = new Map();
  for (const h of holes) {
    const tee =
      h.teeLat != null && h.teeLng != null
        ? { lat: h.teeLat, lng: h.teeLng }
        : null;
    const green =
      h.greenLat != null && h.greenLng != null
        ? { lat: h.greenLat, lng: h.greenLng }
        : null;
    let fairwayPolygon: { lat: number; lng: number }[] | null = null;
    if (h.fairwayPolygonJson) {
      try {
        const parsed = JSON.parse(h.fairwayPolygonJson);
        if (Array.isArray(parsed)) {
          const pts: { lat: number; lng: number }[] = [];
          for (const p of parsed) {
            if (Array.isArray(p) && p.length >= 2) {
              const lat = Number(p[0]);
              const lng = Number(p[1]);
              if (Number.isFinite(lat) && Number.isFinite(lng))
                pts.push({ lat, lng });
            }
          }
          if (pts.length > 2) fairwayPolygon = pts;
        }
      } catch {
        // ignore malformed polygon json
      }
    }
    map.set(`${h.course.name}::${h.hole}`, {
      tee,
      green,
      fairwayPolygon,
      yardageYds: h.distanceYds ?? null,
      strokeIndex: null,
    });
  }
  return map;
}

// Returns one entry per (courseName, holes) that doesn't have *any*
// CourseHole rows in courseHoleMap -- i.e. the OSM seeder hasn't run
// against it yet. We just check the next hole because that's what the
// peek panel needs, but absent geo for the next hole almost always
// implies the whole course is unseeded.
function uniqueUnmapped(
  matches: GridMatch[],
  courseHoleMap: NextHoleGeoMap,
): { name: string; holes: number }[] {
  const seen = new Set<string>();
  const out: { name: string; holes: number }[] = [];
  for (const m of matches) {
    if (seen.has(m.courseName)) continue;
    seen.add(m.courseName);
    // Cheap check: do we have ANY hole geo for this course?
    let hasAny = false;
    for (const key of courseHoleMap.keys()) {
      if (key.startsWith(`${m.courseName}::`)) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) out.push({ name: m.courseName, holes: m.holes });
  }
  return out;
}
