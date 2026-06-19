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
  parseWolfConfig,
  type SideGameKind,
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
  // Creator-only, and side games can't be edited on a final match
  // (everything's already settled). UPCOMING + IN_PROGRESS pass.
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

  const format: "INDIVIDUAL" | "SCRAMBLE" =
    match.format === "SCRAMBLE" ? "SCRAMBLE" : "INDIVIDUAL";

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
          playerCount={match.players.length}
          format={format}
          matchStatus={
            match.status === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : match.status === "COMPLETED"
                ? "COMPLETED"
                : "UPCOMING"
          }
          hasTeamVsTeam={sideGameKinds.includes("TEAM_VS_TEAM")}
          initial={{
            sideGames: sideGameKinds,
            skinsPushRule: skinsCfg.pushRule ?? "CARRYOVER",
            wolfPushRule: wolfCfg.pushRule ?? "NO_POINTS",
            targetsStat: targetsCfg?.stat ?? "PAR_OR_BETTER",
            targetsTarget: targetsCfg ? String(targetsCfg.target) : "10",
            targetsAnte: targetsCfg?.ante ? String(targetsCfg.ante) : "",
            sixesStake: sixesCfg?.stake ? String(sixesCfg.stake) : "",
          }}
        />
      </form>
    </div>
  );
}
