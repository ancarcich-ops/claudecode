import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editMatchSideGamesAction } from "@/lib/actions";
import {
  isSideGameKind,
  parseSixesConfig,
  parseSkinsConfig,
  parseTargetsConfig,
  parseTeamVsTeamConfig,
  parseWolfConfig,
  parseStablefordConfig,
  parseBbbConfig,
  parseSnakeConfig,
  parseNassauConfig,
  STABLEFORD_MODIFIED_POINTS,
  type SideGameKind,
  type TeamVsTeamRule,
} from "@/lib/sideGames";
import SideGamesEditor from "./SideGamesEditor";

export const dynamic = "force-dynamic";

export default async function EditSideGamesPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/matches/${params.id}/side-games`);

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      players: { orderBy: { seat: "asc" } },
      sideGames: true,
    },
  });
  if (!match) notFound();
  if (match.createdById !== user.id) redirect(`/matches/${match.id}`);
  if (match.status === "COMPLETED") redirect(`/matches/${match.id}`);

  const sideGameKinds: SideGameKind[] = match.sideGames
    .map((sg) => sg.kind)
    .filter(isSideGameKind);

  const skinsCfg = parseSkinsConfig(
    match.sideGames.find((sg) => sg.kind === "SKINS")?.config,
  );
  const wolfCfg = parseWolfConfig(
    match.sideGames.find((sg) => sg.kind === "WOLF")?.config,
  );
  const targetsCfg = parseTargetsConfig(
    match.sideGames.find((sg) => sg.kind === "TARGETS")?.config,
  );
  const sixesCfg = parseSixesConfig(
    match.sideGames.find((sg) => sg.kind === "SIXES")?.config,
  );
  const stablefordCfg = parseStablefordConfig(
    match.sideGames.find((sg) => sg.kind === "STABLEFORD")?.config,
  );
  const bbbCfg = parseBbbConfig(
    match.sideGames.find((sg) => sg.kind === "BBB")?.config,
  );
  const snakeCfg = parseSnakeConfig(
    match.sideGames.find((sg) => sg.kind === "SNAKE")?.config,
  );
  const nassauCfg = parseNassauConfig(
    match.sideGames.find((sg) => sg.kind === "NASSAU")?.config,
  );
  const tvt = parseTeamVsTeamConfig(
    match.sideGames.find((sg) => sg.kind === "TEAM_VS_TEAM")?.config,
  );

  const format: "INDIVIDUAL" | "SCRAMBLE" =
    match.format === "SCRAMBLE" ? "SCRAMBLE" : "INDIVIDUAL";

  // Per-seat team assignment for the TVT picker. Seed from the stored
  // TVT roster when present; otherwise default to alternating A/B so
  // the user only has to flip a couple of chips.
  const teamById = new Map<string, 0 | 1>();
  if (tvt) {
    for (const id of tvt.teams[0]) teamById.set(id, 0);
    for (const id of tvt.teams[1]) teamById.set(id, 1);
  }
  const seatPlayers = match.players.map((p, i) => ({
    id: p.id,
    displayName: p.displayName,
    team:
      teamById.get(p.id) ??
      (match.format === "SCRAMBLE"
        ? ((p.team === 1 ? 1 : 0) as 0 | 1)
        : ((i % 2) as 0 | 1)),
  }));

  const tvtRules: TeamVsTeamRule[] = tvt ? tvt.rules.map((r) => r.rule) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Side games.
      </h1>
      <p className="text-sm text-mute mb-4">
        Pick the games to track on this round. Scores recompute from the
        strokes already logged.{" "}
        <Link
          href={`/matches/${match.id}`}
          className="text-accent hover:underline"
        >
          Back to match →
        </Link>
      </p>
      <form action={editMatchSideGamesAction} className="space-y-4">
        <SideGamesEditor
          matchId={match.id}
          holes={match.holes}
          players={seatPlayers}
          format={format}
          matchStatus={
            match.status === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : match.status === "COMPLETED"
                ? "COMPLETED"
                : "UPCOMING"
          }
          initial={{
            sideGames: sideGameKinds,
            skinsPushRule: skinsCfg.pushRule ?? "CARRYOVER",
            wolfPushRule: wolfCfg.pushRule ?? "NO_POINTS",
            targetsStat: targetsCfg?.stat ?? "PAR_OR_BETTER",
            targetsTarget: targetsCfg ? String(targetsCfg.target) : "10",
            targetsAnte: targetsCfg?.ante ? String(targetsCfg.ante) : "",
            sixesStake: sixesCfg?.stake ? String(sixesCfg.stake) : "",
            tvtRules,
            stablefordModified: stablefordCfg.points != null,
            stablefordPoints: stablefordCfg.points ?? STABLEFORD_MODIFIED_POINTS,
            bbbPoints: {
              bingo: String(bbbCfg.points?.bingo ?? 1),
              bango: String(bbbCfg.points?.bango ?? 1),
              bongo: String(bbbCfg.points?.bongo ?? 1),
            },
            snakeStake: snakeCfg.stake ? String(snakeCfg.stake) : "",
            snakeDoubling: snakeCfg.doubling ?? false,
            nassauAutoPress: nassauCfg.autoPress ?? false,
            nassauThreshold: String(nassauCfg.autoPressThreshold ?? 2),
            nassauStake: nassauCfg.stake ? String(nassauCfg.stake) : "",
          }}
        />
      </form>
    </div>
  );
}
