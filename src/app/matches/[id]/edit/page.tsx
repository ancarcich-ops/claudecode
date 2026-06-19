import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { editMatchAction } from "@/lib/actions";
import { COURSE_PRESETS } from "@/lib/courses";
import { listUserGroups } from "@/lib/groups";
import {
  isSideGameKind,
  parseMatchConfig,
  parseSixesConfig,
  parseSkinsConfig,
  parseTargetsConfig,
  parseTeamVsTeamConfig,
  parseWolfConfig,
  type SideGameKind,
  type TeamVsTeamRule,
} from "@/lib/sideGames";
import NewMatchForm, { type MatchEditInitial } from "../../new/NewMatchForm";

export const dynamic = "force-dynamic";

export default async function EditMatchPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/matches/${params.id}/edit`);

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      players: { orderBy: { seat: "asc" }, include: { scores: true } },
      sideGames: true,
    },
  });
  if (!match) notFound();
  // Edit is creator-only, and only before the match starts. Anyone else,
  // or a match that's already underway/final, bounces back to the match.
  if (match.createdById !== user.id) redirect(`/matches/${match.id}`);
  if (match.status !== "UPCOMING") redirect(`/matches/${match.id}`);
  if (match.players.some((p) => p.scores.length > 0)) {
    redirect(`/matches/${match.id}`);
  }

  const sideGameKinds: SideGameKind[] = match.sideGames
    .map((sg) => sg.kind)
    .filter(isSideGameKind);

  // Reconstruct each side game's form state from its stored config.
  const tvtRow = match.sideGames.find((sg) => sg.kind === "TEAM_VS_TEAM");
  const tvt = parseTeamVsTeamConfig(tvtRow?.config);
  const matchCfg = parseMatchConfig(
    match.sideGames.find((sg) => sg.kind === "MATCH")?.config,
  );
  const sixesCfg = parseSixesConfig(
    match.sideGames.find((sg) => sg.kind === "SIXES")?.config,
  );
  const targetsCfg = parseTargetsConfig(
    match.sideGames.find((sg) => sg.kind === "TARGETS")?.config,
  );
  const skinsCfg = parseSkinsConfig(
    match.sideGames.find((sg) => sg.kind === "SKINS")?.config,
  );
  const wolfCfg = parseWolfConfig(
    match.sideGames.find((sg) => sg.kind === "WOLF")?.config,
  );

  // Format: SCRAMBLE stays scramble; an individual match carrying a
  // team-vs-team game is the wizard's "BOTH" shortcut.
  const format: "INDIVIDUAL" | "SCRAMBLE" | "BOTH" =
    match.format === "SCRAMBLE"
      ? "SCRAMBLE"
      : sideGameKinds.includes("TEAM_VS_TEAM")
        ? "BOTH"
        : "INDIVIDUAL";

  // Per-player team. Scramble uses the stored team column; "BOTH" pulls it
  // from the team-vs-team roster; otherwise a default alternating split.
  const teamById = new Map<string, 0 | 1>();
  if (tvt) {
    for (const id of tvt.teams[0]) teamById.set(id, 0);
    for (const id of tvt.teams[1]) teamById.set(id, 1);
  }
  const players = match.players.map((p, i) => ({
    name: p.displayName,
    handicap: String(p.handicap),
    userId: p.userId,
    team:
      match.format === "SCRAMBLE"
        ? ((p.team === 1 ? 1 : 0) as 0 | 1)
        : (teamById.get(p.id) ?? ((i % 2) as 0 | 1)),
  }));

  // Match manual strokes are stored keyed by matchPlayerId; the form keeps
  // them keyed by seat index.
  const idToSeat = new Map(match.players.map((p, i) => [p.id, i]));
  const matchManualStrokes: Record<number, string> = {};
  if (matchCfg?.manualStrokes) {
    for (const [pid, n] of Object.entries(matchCfg.manualStrokes)) {
      const seat = idToSeat.get(pid);
      if (seat != null) matchManualStrokes[seat] = String(n);
    }
  }

  const tvtRules: TeamVsTeamRule[] = tvt ? tvt.rules.map((r) => r.rule) : [];
  const vegasRule = tvt?.rules.find((r) => r.rule === "VEGAS");

  // Scramble handicap config.
  let scrambleHcpMode: "GROSS" | "AVG" | "CUSTOM" = "GROSS";
  let scrambleCustomA = "";
  let scrambleCustomB = "";
  if (match.scrambleConfig) {
    try {
      const sc = JSON.parse(match.scrambleConfig);
      if (sc?.handicapMode === "AVG" || sc?.handicapMode === "CUSTOM") {
        scrambleHcpMode = sc.handicapMode;
      }
      if (sc?.customAllowance) {
        if (sc.customAllowance[0] != null)
          scrambleCustomA = String(sc.customAllowance[0]);
        if (sc.customAllowance[1] != null)
          scrambleCustomB = String(sc.customAllowance[1]);
      }
    } catch {
      // ignore -- defaults stand
    }
  }

  const initial: MatchEditInitial = {
    courseName: match.courseName,
    // datetime-local wants naive "YYYY-MM-DDTHH:mm". The stored Date round-
    // trips through UTC components, matching how the create action read the
    // original naive string.
    scheduledAt: match.scheduledAt.toISOString().slice(0, 16),
    holes: (match.holes === 9 ? 9 : 18) as 9 | 18,
    startingHole: (match.startingHole === 10 ? 10 : 1) as 1 | 10,
    scoringMode:
      match.scoringMode === "GROSS" || match.scoringMode === "CUSTOM"
        ? match.scoringMode
        : "NET",
    format,
    scrambleHcpMode,
    scrambleCustomA,
    scrambleCustomB,
    players,
    sideGames: sideGameKinds,
    tvtRules,
    vegasBirdieFlip: vegasRule?.vegas?.birdieFlip ?? false,
    vegasDoubleHoles: vegasRule?.vegas?.doubleHoles ?? "OFF",
    vegasStake: vegasRule?.stake ? String(vegasRule.stake) : "",
    targetsStat: targetsCfg?.stat ?? "PAR_OR_BETTER",
    targetsTarget: targetsCfg ? String(targetsCfg.target) : "10",
    targetsAnte: targetsCfg?.ante ? String(targetsCfg.ante) : "",
    matchStrokesMode: matchCfg?.strokesMode ?? "AUTO",
    matchManualStrokes,
    matchAutoPress: matchCfg?.autoPress ?? false,
    matchAutoPressThreshold: matchCfg?.autoPressThreshold
      ? String(matchCfg.autoPressThreshold)
      : "2",
    matchStake: matchCfg?.stake ? String(matchCfg.stake) : "",
    sixesStake: sixesCfg?.stake ? String(sixesCfg.stake) : "",
    skinsPushRule: skinsCfg.pushRule ?? "CARRYOVER",
    wolfPushRule: wolfCfg.pushRule ?? "NO_POINTS",
    notes: match.notes ?? "",
    groupId: match.groupId ?? "public",
  };

  const groups = await listUserGroups(user.id);
  const defaultName =
    user.displayName ??
    user.username.charAt(0).toUpperCase() + user.username.slice(1);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Edit the round.
      </h1>
      <p className="text-sm text-mute mb-6">
        Change the course, tee time, players, or games before the match starts.
      </p>
      <NewMatchForm
        action={editMatchAction}
        defaultPlayerName={defaultName}
        currentUserId={user.id}
        recentCourses={[]}
        presets={COURSE_PRESETS}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={initial.groupId}
        initial={initial}
        submitLabel="Save changes"
        hiddenFields={{ matchId: match.id }}
      />
    </div>
  );
}
