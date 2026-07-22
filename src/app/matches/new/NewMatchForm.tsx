"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { CoursePreset } from "@/lib/courses";
import { findClosestCoursesAction } from "@/lib/actions";
import PlayerNameInput from "@/components/PlayerNameInput";
import {
  ALL_SIDE_GAMES,
  COMING_SOON_SIDE_GAMES,
  TEAM_VS_TEAM_RULES,
  teamVsTeamRuleBlurb,
  teamVsTeamRuleLabel,
  STABLEFORD_WHS_POINTS,
  STABLEFORD_MODIFIED_POINTS,
  type SideGameKind,
  type StablefordPoints,
  type TeamVsTeamRule,
} from "@/lib/sideGames";

type NearbyCourse = { name: string; yards: number };

// Max players that can join one scorecard. Raised from 6 -> 8 so two
// foursomes can play together on a single match (a common Saturday
// "two carts, one card" setup).
const MAX_PLAYERS = 8;

// localStorage key for the in-progress new-match draft. Bumped if the
// shape ever changes incompatibly.
const NEW_MATCH_DRAFT_KEY = "sticks-new-match-draft-v1";

type PlayerRow = {
  name: string;
  handicap: string;
  userId: string | null;
  // Team assignment used only when format === "SCRAMBLE". Default 0
  // for even indices, 1 for odd, so an unedited 4-player match opens
  // as a clean 2v2 split.
  team: 0 | 1;
  // True when this slot is linked to a real Sticks user who hasn't
  // logged 3+ rounds yet, so we don't have a real index. The form
  // leaves the field blank + italic + flagged with a pending note so
  // nobody confuses a fake default for a real handicap.
  handicapPending?: boolean;
};
type ScoringMode = "NET" | "GROSS" | "CUSTOM";

// Past round the user created, normalized to wizard state shape. Tapping
// one fills every field on every step except tee time (defaults to the
// usual "tomorrow" pick) and notes.
export type MatchTemplate = {
  id: string;
  courseName: string;
  scheduledAt: string; // ISO; we only show the date in the picker
  holes: 9 | 18;
  startingHole: 1 | 10;
  scoringMode: ScoringMode;
  players: { name: string; handicap: string; userId: string | null }[];
  sideGames: SideGameKind[];
};

const MODE_COPY: Record<
  ScoringMode,
  { label: string; sub: string; field: string; help: string }
> = {
  NET: {
    label: "Net",
    sub: "Handicap",
    field: "Hcp",
    help: "Lowest gross minus handicap wins. Lower handicap is the market favorite at open.",
  },
  GROSS: {
    label: "Gross",
    sub: "Straight up",
    field: "Hcp",
    help: "Lowest raw score wins. Handicaps are informational only.",
  },
  CUSTOM: {
    label: "Custom",
    sub: "Group strokes",
    field: "Strokes",
    help: "Set each player's stroke allowance on the next step (Players). Lowest gross minus strokes wins.",
  },
};

const STEPS = [
  { key: "round", title: "Round" },
  { key: "players", title: "Players" },
  { key: "extras", title: "Side games" },
] as const;

// Full pre-fill for edit mode. Mirrors every piece of wizard state so an
// existing match can be reopened in the same form. Built server-side in
// /matches/[id]/edit from the stored Match + MatchPlayer + SideGame rows.
export type MatchEditInitial = {
  courseName: string;
  scheduledAt: string; // datetime-local "YYYY-MM-DDTHH:mm"
  holes: 9 | 18;
  startingHole: 1 | 10;
  scoringMode: ScoringMode;
  format: "INDIVIDUAL" | "SCRAMBLE" | "BOTH";
  scrambleHcpMode: "GROSS" | "AVG" | "CUSTOM";
  scrambleCustomA: string;
  scrambleCustomB: string;
  players: { name: string; handicap: string; userId: string | null; team: 0 | 1 }[];
  sideGames: SideGameKind[];
  tvtRules: TeamVsTeamRule[];
  vegasBirdieFlip: boolean;
  vegasDoubleHoles: "OFF" | "INCREMENTAL" | "EXPONENTIAL";
  vegasStake: string;
  targetsStat: "PAR_OR_BETTER" | "BIRDIE_OR_BETTER";
  targetsTarget: string;
  targetsAnte: string;
  matchStrokesMode: "AUTO" | "MANUAL";
  matchManualStrokes: Record<number, string>;
  matchAutoPress: boolean;
  matchAutoPressThreshold: string;
  matchStake: string;
  sixesStake: string;
  // Tie-handling for the games where ties actually decide payouts.
  // Skins: CARRYOVER (skin rolls to next hole) vs NO_CARRY (pushed
  // hole pays no skin, next hole resets). Wolf: ROLLOVER (push
  // multiplier carries) vs NO_POINTS (pushed hole = 0 points).
  skinsPushRule: "CARRYOVER" | "NO_CARRY";
  wolfPushRule: "NO_POINTS" | "ROLLOVER";
  // Stableford scale + custom point table (used only when modified).
  stablefordModified?: boolean;
  stablefordPoints?: StablefordPoints;
  // BBB points per event (strings for inputs) + Snake stake/doubling.
  bbbPoints?: { bingo: string; bango: string; bongo: string };
  snakeStake?: string;
  snakeDoubling?: boolean;
  // Nassau auto-press + threshold + stake.
  nassauAutoPress?: boolean;
  nassauThreshold?: string;
  nassauStake?: string;
  notes: string;
  groupId: string;
};

export default function NewMatchForm({
  action,
  defaultPlayerName,
  defaultPlayerHandicap = "12",
  userHandicapPending = false,
  currentUserId,
  recentCourses,
  presets,
  groups,
  defaultGroupId,
  templates = [],
  initial,
  submitLabel,
  hiddenFields,
  prefilledPlayers,
  availableRosterPlayers,
  defaultCourseName,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  // Pre-filled handicap for the creator's seat. Comes from their computed
  // Sticks index when available; the parent supplies the fallback string.
  defaultPlayerHandicap?: string;
  // True when the creator hasn't logged 3+ rounds yet, so we don't have a
  // real index for them. The form leaves their hcp field blank instead of
  // faking a value, and surfaces a small note explaining what's missing.
  userHandicapPending?: boolean;
  currentUserId: string;
  recentCourses: string[];
  presets: CoursePreset[];
  groups: { id: string; name: string }[];
  defaultGroupId: string;
  // Cloneable past rounds; tapping one pre-fills the whole wizard.
  templates?: MatchTemplate[];
  // When present, the wizard opens in edit mode: every field is
  // pre-filled from an existing match and the submit button reads
  // submitLabel (e.g. "Save changes") instead of "Start round".
  initial?: MatchEditInitial;
  submitLabel?: string;
  // Extra hidden inputs rendered inside the form (e.g. { matchId } for edit).
  hiddenFields?: Record<string, string>;
  // Pre-fills the roster when the user is starting a tournament round.
  // Honored only when `initial` isn't set (which is the create flow);
  // otherwise edit-mode takes precedence.
  prefilledPlayers?: {
    name: string;
    handicap: string;
    userId: string | null;
  }[];
  // Tournament roster members the user can drop straight into the
  // foursome with one tap. Filtered server-side to exclude the
  // creator and anyone already booked for this round in another
  // foursome. Surfaces a "+ From tournament roster" dropdown on the
  // Players step.
  availableRosterPlayers?: {
    name: string;
    handicap: string;
    userId: string | null;
  }[];
  // Pre-selects the course on a fresh round (e.g. a tournament pins its
  // venue). Only used in the create flow; `initial` (edit mode) wins.
  defaultCourseName?: string;
}) {
  // Edit mode + ?step=side-games deep link from the match detail page.
  // We resolve the param in a post-mount effect rather than via
  // useSearchParams() to stay clear of Next.js's Suspense-boundary
  // requirement for that hook (which caused the edit page to throw
  // when the CTA dropped users in here).
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!initial) return;
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("step");
    if (!raw) return;
    const named: Record<string, number> = {
      round: 0,
      players: 1,
      extras: 2,
      "side-games": 2,
      sidegames: 2,
    };
    const target =
      named[raw] != null
        ? named[raw]
        : Number.isFinite(parseInt(raw, 10))
          ? Math.max(0, Math.min(2, parseInt(raw, 10)))
          : 0;
    setStep(target);
    // Only fire on first mount -- subsequent step changes are driven
    // by Next / Back buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Guided progressive reveal for the Round step. The user is walked
  // through one decision at a time -- 0: course, 1: tee + holes, 2:
  // format + scoring, 3: details (everything revealed). Completed
  // groups collapse into editable summary chips; the active group gets
  // a pulsing emerald ring. In edit mode the whole step is pre-answered,
  // so start fully revealed.
  const [roundStep, setRoundStep] = useState(initial ? 3 : 0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>(() => {
    if (initial) {
      return initial.players.map((p) => ({
        name: p.name,
        handicap: p.handicap,
        userId: p.userId,
        team: p.team,
      }));
    }
    if (prefilledPlayers && prefilledPlayers.length > 0) {
      // Tournament round mode: seed the roster from the caller and
      // alternate teams so a 4-player roster opens as a clean 2v2
      // if someone flips the format to scramble.
      return prefilledPlayers.map((p, i) => ({
        name: p.name,
        handicap: p.handicap,
        userId: p.userId,
        team: (i % 2) as 0 | 1,
      }));
    }
    return [
      // Default to a foursome with 1 filled + 3 blanks. The Round
      // step's "Round size" chip lets the user collapse this to
      // Solo / 2-player / Threesome before editing names.
      {
        name: defaultPlayerName,
        handicap: defaultPlayerHandicap,
        userId: currentUserId,
        team: 0,
        handicapPending: userHandicapPending,
      },
      { name: "", handicap: "15", userId: null, team: 1 },
      { name: "", handicap: "15", userId: null, team: 0 },
      { name: "", handicap: "15", userId: null, team: 1 },
    ];
  });
  const [sideGames, setSideGames] = useState<Set<SideGameKind>>(
    () => new Set(initial?.sideGames ?? []),
  );

  const toggleSideGame = (kind: SideGameKind) =>
    setSideGames((curr) => {
      const next = new Set(curr);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const [courseName, setCourseName] = useState(
    initial?.courseName ?? defaultCourseName ?? "",
  );
  const [nearby, setNearby] = useState<NearbyCourse[] | null>(null);
  // Controls visibility of the custom course-search dropdown. iOS
  // Safari's native <datalist> renders as 3 chips on the keyboard
  // accessory bar, which is useless for browsing a 500-course
  // catalog -- so the dropdown is a regular scrollable list below
  // the input that opens on focus.
  const [courseFocused, setCourseFocused] = useState(false);
  const [locating, startLocating] = useTransition();
  const [holes, setHoles] = useState<9 | 18>(initial?.holes ?? 18);
  // 1 = full or front 9, 10 = back 9. Only meaningful when holes === 9.
  const [startingHole, setStartingHole] = useState<1 | 10>(
    initial?.startingHole ?? 1,
  );
  const [scoringMode, setScoringMode] = useState<ScoringMode>(
    initial?.scoringMode ?? "NET",
  );
  // Wrapping the scoringMode setter so a transition INTO CUSTOM
  // resets every player's strokes-given to "0". The field's meaning
  // flips when CUSTOM is picked -- it's no longer the player's HCP
  // index, it's the strokes the group decides to give them -- so
  // carrying the prior handicap number across the transition is
  // misleading. Other transitions (CUSTOM->NET, GROSS->NET) leave
  // values alone since they're still measuring handicap.
  const changeScoringMode = (next: ScoringMode) => {
    if (next === "CUSTOM" && scoringMode !== "CUSTOM") {
      setPlayers((rows) => rows.map((r) => ({ ...r, handicap: "0" })));
    }
    setScoringMode(next);
  };
  const modeCopy = MODE_COPY[scoringMode];
  // Match format: INDIVIDUAL is the existing all-vs-all play; SCRAMBLE
  // is 2 teams sharing one ball-per-team-per-hole. BOTH is a
  // client-side shortcut for "individual scoring AND team-vs-team
  // side game on" -- the server still receives format=INDIVIDUAL but
  // TEAM_VS_TEAM is auto-added to the side-games list and the team
  // rule picker surfaces alongside the scoring picker.
  const [format, setFormat] = useState<"INDIVIDUAL" | "SCRAMBLE" | "BOTH">(
    initial?.format ?? "INDIVIDUAL",
  );
  const [scrambleHcpMode, setScrambleHcpMode] = useState<
    "GROSS" | "AVG" | "CUSTOM"
  >(initial?.scrambleHcpMode ?? "GROSS");
  // Custom per-team allowances, only used when scrambleHcpMode is
  // CUSTOM. Strings instead of numbers so the input is comfortable
  // to type in (leading 0s, partial entries during edit, etc.); the
  // submitted scrambleConfig coerces to numbers.
  const [scrambleCustomA, setScrambleCustomA] = useState(
    initial?.scrambleCustomA ?? "",
  );
  const [scrambleCustomB, setScrambleCustomB] = useState(
    initial?.scrambleCustomB ?? "",
  );
  // Team-vs-Team side game configuration. The team picker (chips
  // per player row) shares state with the SCRAMBLE format's chips
  // -- PlayerRow.team is the single source of truth and surfaces
  // whenever EITHER scramble is the format OR the TEAM_VS_TEAM
  // side game is enabled.
  // Team rules are now multi-select; each selected rule produces its
  // own leaderboard. Wagers were removed from this surface to declutter
  // the picker -- money games happen at the group level, not here.
  const [tvtRules, setTvtRules] = useState<Set<TeamVsTeamRule>>(() =>
    initial && initial.tvtRules.length > 0
      ? new Set(initial.tvtRules)
      : new Set(["BEST_BALL"]),
  );
  // Vegas-specific options. Only honored when VEGAS is among tvtRules.
  const [vegasBirdieFlip, setVegasBirdieFlip] = useState(
    initial?.vegasBirdieFlip ?? false,
  );
  const [vegasDoubleHoles, setVegasDoubleHoles] = useState<
    "OFF" | "INCREMENTAL" | "EXPONENTIAL"
  >(initial?.vegasDoubleHoles ?? "OFF");
  const toggleTvtRule = (r: TeamVsTeamRule) => {
    let added = false;
    setTvtRules((prev) => {
      const next = new Set(prev);
      if (next.has(r)) {
        // Don't allow zero rules -- at least one must remain checked.
        if (next.size > 1) next.delete(r);
      } else {
        next.add(r);
        added = true;
      }
      return next;
    });
    // Auto-flip Scramble -> Both when a rule that needs each player to
    // play their own ball is added. Scramble only records one ball per
    // team per hole, so rules like High/Low, Best Ball, Vegas, Sum,
    // Aggregate Net are uncomputable in that mode. All current
    // TEAM_VS_TEAM_RULES need two balls, so any add while in scramble
    // triggers the switch.
    if (added && format === "SCRAMBLE") {
      setFormat("BOTH");
      toast.message(
        `Switched to Both — ${teamVsTeamRuleLabel(r)} needs each player to play their own ball.`,
      );
    }
  };
  // Targets config -- only sent when TARGETS is selected. Defaults
  // chosen to be sensible for an 18-hole round.
  const [targetsStat, setTargetsStat] = useState<
    "PAR_OR_BETTER" | "BIRDIE_OR_BETTER"
  >(initial?.targetsStat ?? "PAR_OR_BETTER");
  const [targetsTarget, setTargetsTarget] = useState(
    initial?.targetsTarget ?? "10",
  );
  // Optional pot ante per player. Blank/zero = no pot, just the count.
  const [targetsAnte, setTargetsAnte] = useState(initial?.targetsAnte ?? "");
  // Match-play stroke-giving. AUTO = use the match scoringMode + each
  // player's handicap (default). MANUAL = use per-player strokes typed
  // below, regardless of the scoringMode.
  const [matchStrokesMode, setMatchStrokesMode] = useState<"AUTO" | "MANUAL">(
    initial?.matchStrokesMode ?? "AUTO",
  );
  const [matchManualStrokes, setMatchManualStrokes] = useState<
    Record<number, string>
  >(() => initial?.matchManualStrokes ?? {});
  // Match auto-press: only meaningful for 2-player matches; the
  // server compute ignores it otherwise.
  const [matchAutoPress, setMatchAutoPress] = useState(
    initial?.matchAutoPress ?? false,
  );
  const [matchAutoPressThreshold, setMatchAutoPressThreshold] = useState(
    initial?.matchAutoPressThreshold ?? "2",
  );
  // Match dollar wager per dot. Blank/zero = no $ math.
  const [matchStake, setMatchStake] = useState(initial?.matchStake ?? "");
  // Tie-handling rule for Skins. CARRYOVER (the long-standing default)
  // rolls a pushed hole's skin into the next; NO_CARRY pays nothing
  // on a tie and resets the pot to 1 next hole.
  const [skinsPushRule, setSkinsPushRule] = useState<
    "CARRYOVER" | "NO_CARRY"
  >(initial?.skinsPushRule ?? "CARRYOVER");
  // Tie-handling rule for Wolf. NO_POINTS (default) drops pushed
  // holes; ROLLOVER carries a multiplier into the next resolved hole.
  const [wolfPushRule, setWolfPushRule] = useState<
    "NO_POINTS" | "ROLLOVER"
  >(initial?.wolfPushRule ?? "NO_POINTS");
  // Sixes dollar wager per dot.
  const [sixesStake, setSixesStake] = useState(initial?.sixesStake ?? "");
  // Vegas dollar wager per Vegas point.
  const [vegasStake, setVegasStake] = useState(initial?.vegasStake ?? "");
  // Stableford scale: false = WHS standard, true = modified (custom
  // points, negatives allowed). Points seed from the modified preset.
  const [stablefordModified, setStablefordModified] = useState(
    initial?.stablefordModified ?? false,
  );
  const [stablefordPoints, setStablefordPoints] = useState<StablefordPoints>(
    initial?.stablefordPoints ?? STABLEFORD_MODIFIED_POINTS,
  );
  // BBB points per event (default 1 each). Stored as strings for inputs.
  const [bbbPoints, setBbbPoints] = useState(
    initial?.bbbPoints ?? { bingo: "1", bango: "1", bongo: "1" },
  );
  // Snake stake + doubling.
  const [snakeStake, setSnakeStake] = useState(initial?.snakeStake ?? "");
  const [snakeDoubling, setSnakeDoubling] = useState(
    initial?.snakeDoubling ?? false,
  );
  // Nassau auto-press + threshold + stake.
  const [nassauAutoPress, setNassauAutoPress] = useState(
    initial?.nassauAutoPress ?? false,
  );
  const [nassauThreshold, setNassauThreshold] = useState(
    initial?.nassauThreshold ?? "2",
  );
  const [nassauStake, setNassauStake] = useState(initial?.nassauStake ?? "");

  // Keep sideGames in sync with the format picker. Both Teams
  // (SCRAMBLE) and Both auto-enable TEAM_VS_TEAM so the rule picker
  // above actually drives a team-vs-team leaderboard. INDIVIDUAL
  // doesn't auto-toggle anything -- the user can still pick side
  // games manually on step 2.
  //
  // Teams also prunes any per-player side games already selected:
  // when only one score per team per hole is logged, Stableford /
  // Skins / Nassau / BBB / Wolf have nothing to score against.
  // Snake survives because it's event-based (3-putts).
  useEffect(() => {
    setSideGames((curr) => {
      const next = new Set(curr);
      if (format === "BOTH" || format === "SCRAMBLE") {
        next.add("TEAM_VS_TEAM");
        if (format === "SCRAMBLE") {
          for (const k of next) {
            if (k !== "SNAKE" && k !== "TEAM_VS_TEAM") next.delete(k);
          }
        }
      } else {
        // Format reverted to INDIVIDUAL (e.g. user dropped the round
        // size below 4) -- clear the auto-added team game so the
        // submitted match doesn't carry a stale team config.
        next.delete("TEAM_VS_TEAM");
      }
      // Only return a new Set if something actually changed.
      if (next.size === curr.size) {
        let same = true;
        for (const k of next) if (!curr.has(k)) { same = false; break; }
        if (same) return curr;
      }
      return next;
    });
  }, [format]);

  // Custom strokes aren't offered on Individual rounds (single ball,
  // every player's own card), so snap a leftover CUSTOM selection back
  // to NET whenever the format flips that way. Stops the scoringMode
  // state from drifting away from what's visible in the picker.
  useEffect(() => {
    if (format === "INDIVIDUAL" && scoringMode === "CUSTOM") {
      setScoringMode("NET");
    }
  }, [format, scoringMode]);

  const presetByName = useMemo(() => {
    const m = new Map<string, CoursePreset>();
    for (const p of presets) m.set(p.name.toLowerCase(), p);
    return m;
  }, [presets]);

  const matchedPreset = presetByName.get(courseName.trim().toLowerCase());

  // Tee sets for the matched course, for the per-player tee picker.
  // Fetched from the DB (CourseTee) whenever the matched course changes;
  // empty when the course has no rating data yet (picker hides, rounds
  // post without a tee -> score-only handicap fallback).
  const [courseTees, setCourseTees] = useState<{
    tees: {
      name: string;
      gender: string;
      rating: number;
      slope: number;
      yardage: number | null;
    }[];
    defaultTeeName: string | null;
  }>({ tees: [], defaultTeeName: null });
  useEffect(() => {
    const name = matchedPreset?.name;
    if (!name) {
      setCourseTees({ tees: [], defaultTeeName: null });
      return;
    }
    let cancelled = false;
    fetch(`/api/courses/tees?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : { tees: [], defaultTeeName: null }))
      .then((d) => {
        if (!cancelled) setCourseTees(d);
      })
      .catch(() => {
        if (!cancelled) setCourseTees({ tees: [], defaultTeeName: null });
      });
    return () => {
      cancelled = true;
    };
  }, [matchedPreset?.name]);

  // The default tee's "Name|Gender" value (men's default), for the
  // per-row select's initial selection.
  const defaultTeeValue = (() => {
    const d = courseTees.tees.find(
      (t) => t.name === courseTees.defaultTeeName && t.gender === "M",
    ) ?? courseTees.tees.find((t) => t.name === courseTees.defaultTeeName);
    return d ? `${d.name}|${d.gender}` : "";
  })();

  const parsToSubmit = (() => {
    if (!matchedPreset) return null;
    if (matchedPreset.holes === holes) return matchedPreset.pars;
    if (matchedPreset.holes === 18 && holes === 9) {
      return startingHole === 10
        ? matchedPreset.pars.slice(9, 18)
        : matchedPreset.pars.slice(0, 9);
    }
    return null;
  })();

  const onCourseChange = (value: string) => {
    setCourseName(value);
    const preset = presetByName.get(value.trim().toLowerCase());
    if (preset) {
      setHoles(preset.holes);
      if (preset.holes === 18) setStartingHole(1);
    }
  };

  // Geolocation-based suggestion. Only courses that have a centerLat /
  // centerLng on record are scored -- i.e. ones a user has imported
  // from GolfBert or OSM, or hand-marked. Brand-new presets without
  // coords are skipped (deliberate: avoids guessing).
  const findNearbyCourses = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location not available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startLocating(async () => {
          try {
            const r = await findClosestCoursesAction({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            setNearby(r);
            if (r.length === 0) {
              toast.info("No mapped courses within 50 miles");
            } else if (!courseName.trim()) {
              // Auto-fill the nearest if the box is empty.
              onCourseChange(r[0].name);
            }
          } catch (err) {
            toast.error((err as Error).message);
          }
        });
      },
      (err) => {
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Allow location to find nearby courses"
            : "Couldn't read your location",
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  };

  // Auto-locate on mount: silently populate the nearby suggestion list
  // when geolocation is available. We do NOT fill the course input --
  // leaving it empty keeps the "Search 500+ courses…" placeholder
  // visible so the search affordance is discoverable. The user picks
  // from the suggestion list or types their own query.
  const autoLocatedRef = useRef(false);
  useEffect(() => {
    if (autoLocatedRef.current) return;
    if (courseName.trim().length > 0) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    autoLocatedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startLocating(async () => {
          try {
            const r = await findClosestCoursesAction({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            // Only populate when nothing's been typed in the meantime --
            // the geo callback can fire after the user started typing.
            if (r.length > 0 && !courseName.trim()) {
              setNearby(r);
            }
          } catch {
            // silent on auto-attempt
          }
        });
      },
      () => {
        // silent on auto-attempt -- user denied, timeout, etc.
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
    // Intentionally an empty dep array: we only want to fire once per
    // mount. courseName is read off the closure but the ref guard +
    // the inner courseName check prevent re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onHolesChange = (value: 9 | 18) => {
    setHoles(value);
    if (value === 18) setStartingHole(1);
  };

  const setPlayer = (i: number, patch: Partial<PlayerRow>) =>
    setPlayers((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );

  const addPlayer = () =>
    players.length < MAX_PLAYERS &&
    setPlayers((rows) => [
      ...rows,
      {
        name: "",
        handicap: "18",
        userId: null,
        // New player joins the team with fewer members so scramble
        // matches stay balanced by default; ties go to team 1 so the
        // 3rd player on a 2-player match defaults to "Team B".
        team:
          rows.filter((r) => r.team === 0).length <=
          rows.filter((r) => r.team === 1).length
            ? 0
            : 1,
      },
    ]);
  const removePlayer = (i: number) =>
    setPlayers((rows) =>
      rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows,
    );

  // Round-size chip: snap the players array to N slots without losing
  // existing names. Growing pads with blanks; shrinking drops trailing
  // rows. Format chips that need 4+ players auto-revert to Individual
  // when the size drops below 4, and solo always means Individual.
  const setPlayerCount = (n: 1 | 2 | 3 | 4) => {
    setPlayers((rows) => {
      if (rows.length === n) return rows;
      if (rows.length > n) return rows.slice(0, n);
      const out = [...rows];
      while (out.length < n) {
        const team0 = out.filter((r) => r.team === 0).length;
        const team1 = out.filter((r) => r.team === 1).length;
        out.push({
          name: "",
          handicap: "15",
          userId: null,
          team: team0 <= team1 ? 0 : 1,
        });
      }
      return out;
    });
    if (n < 4 && (format === "SCRAMBLE" || format === "BOTH")) {
      setFormat("INDIVIDUAL");
    }
    if (n === 1) {
      setFormat("INDIVIDUAL");
    }
  };

  // Clone a past round into the wizard. Pulls everything except tee time
  // (stays at the default tomorrow pick) and notes (round-specific). The
  // user can still edit any field after applying.
  const applyTemplate = (t: MatchTemplate) => {
    setCourseName(t.courseName);
    setHoles(t.holes);
    setStartingHole(t.startingHole);
    setScoringMode(t.scoringMode);
    setPlayers(
      t.players.map((p, i) => ({
        name: p.name,
        handicap: p.handicap,
        userId: p.userId,
        // Templates don't carry team data -- default alternating so a
        // scramble-converted template lands on a sensible split.
        team: (i % 2) as 0 | 1,
      })),
    );
    setSideGames(new Set(t.sideGames));
    setTemplatesOpen(false);
    // Cloning fills every Round field, so skip the guided reveal.
    setRoundStep(3);
  };

  // Controlled tee-time string in the same shape as <input
  // type="datetime-local"> expects ("YYYY-MM-DDTHH:mm"). We control it
  // so we can show our own short label ("5/17 · 9:00pm") on top of an
  // invisible native input -- the picker still works, but the visible
  // text isn't the OS's wordy default that overflows the half-width
  // box on phones.
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    if (initial?.scheduledAt) return initial.scheduledAt;
    // Default to 15 minutes from now: most users open the form right
    // before teeing off, and a short lead-time keeps the line "open"
    // briefly so the group can lock wagers in before the round starts.
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  });

  // Filtered list shown in the focus-triggered dropdown. Empty query
  // returns the full catalog A-Z (capped) so the dropdown also works
  // as a browse view; a typed query narrows by substring match on
  // name or city, with name-prefix matches floated to the top.
  // Hidden entirely once the typed value exactly matches a preset --
  // the green confirmation block below the input takes over.
  const courseResults = useMemo(() => {
    if (matchedPreset && courseName.trim() === matchedPreset.name) return [];
    const q = courseName.trim().toLowerCase();
    if (!q) {
      return [...presets]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 100);
    }
    const matches = presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q),
    );
    matches.sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.name.localeCompare(b.name);
    });
    return matches.slice(0, 100);
  }, [courseName, matchedPreset, presets]);

  // Per-step validation. The Next button is disabled when the current
  // step has unfilled / invalid data. The final step always validates
  // (the side-game step is optional input only).
  const canAdvance = (() => {
    // Course must match an entry in our catalog -- free-text course
    // names are no longer allowed; users pick from the 500+ pre-mapped
    // list, or contact support to request a missing course.
    if (step === 0) return !!matchedPreset;
    if (step === 1) {
      return players.every(
        (p) => p.name.trim().length > 0 && !Number.isNaN(parseFloat(p.handicap)),
      );
    }
    return true;
  })();

  // Solo rounds skip the Side games step entirely -- no opponents means
  // there's nothing meaningful to wager on -- so the Players screen
  // doubles as the final step and its "Next" button becomes "Start
  // round" instead.
  const isSolo = players.length === 1;
  const lastStep = isSolo ? 1 : STEPS.length - 1;
  const visibleSteps = isSolo ? STEPS.slice(0, 2) : STEPS;

  const tryNext = () => {
    if (!canAdvance) return;
    if (step < lastStep) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  // Draft persistence -- if the user starts a match and navigates
  // away (Home, a group page, etc), we save the wizard's core state
  // to localStorage so they pick up where they left off when they
  // come back. Only the high-signal fields are persisted; deep
  // side-game configs (Wolf rotation, Targets stat, etc) reset --
  // those are quick to re-pick if you got that far.
  //
  // The draft is cleared as the form is submitted (in the action
  // wrapper below). Edit mode (initial != null) skips persistence
  // entirely so editing a real match doesn't trample the new-match
  // draft or vice versa.
  const isEditMode = !!initial;
  useEffect(() => {
    if (isEditMode) return;
    try {
      const draft = {
        v: 1,
        savedAt: Date.now(),
        step,
        courseName,
        holes,
        startingHole,
        scoringMode,
        format,
        players,
        sideGames: Array.from(sideGames),
        scheduledAt,
        skinsPushRule,
        wolfPushRule,
      };
      window.localStorage.setItem(NEW_MATCH_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Quota errors / disabled storage -- silent fail, the draft
      // just doesn't persist.
    }
  }, [
    isEditMode,
    step,
    courseName,
    holes,
    startingHole,
    scoringMode,
    format,
    players,
    sideGames,
    scheduledAt,
    skinsPushRule,
    wolfPushRule,
  ]);

  // Restore on first mount (skip edit mode). Drafts older than 7 days
  // are dropped so a forgotten one doesn't quietly clobber a fresh
  // intentional start later.
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (isEditMode) return;
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    try {
      const raw = window.localStorage.getItem(NEW_MATCH_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        v?: number;
        savedAt?: number;
        step?: number;
        courseName?: string;
        holes?: 9 | 18;
        startingHole?: 1 | 10;
        scoringMode?: ScoringMode;
        format?: "INDIVIDUAL" | "SCRAMBLE" | "BOTH";
        players?: PlayerRow[];
        sideGames?: SideGameKind[];
        scheduledAt?: string;
        skinsPushRule?: "CARRYOVER" | "NO_CARRY";
        wolfPushRule?: "NO_POINTS" | "ROLLOVER";
      };
      if (draft.v !== 1) return;
      if (draft.savedAt && Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
        window.localStorage.removeItem(NEW_MATCH_DRAFT_KEY);
        return;
      }
      if (typeof draft.step === "number") setStep(draft.step);
      if (typeof draft.courseName === "string") setCourseName(draft.courseName);
      if (draft.holes === 9 || draft.holes === 18) setHoles(draft.holes);
      if (draft.startingHole === 1 || draft.startingHole === 10) {
        setStartingHole(draft.startingHole);
      }
      if (draft.scoringMode) setScoringMode(draft.scoringMode);
      if (draft.format) setFormat(draft.format);
      if (Array.isArray(draft.players) && draft.players.length > 0) {
        setPlayers(draft.players);
      }
      if (Array.isArray(draft.sideGames)) {
        setSideGames(new Set(draft.sideGames));
      }
      if (typeof draft.scheduledAt === "string") setScheduledAt(draft.scheduledAt);
      if (draft.skinsPushRule === "CARRYOVER" || draft.skinsPushRule === "NO_CARRY") {
        setSkinsPushRule(draft.skinsPushRule);
      }
      if (draft.wolfPushRule === "NO_POINTS" || draft.wolfPushRule === "ROLLOVER") {
        setWolfPushRule(draft.wolfPushRule);
      }
    } catch {
      // Bad JSON -- silently drop, fresh start is fine.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      action={async (fd) => {
        // Clear the saved draft before handing off to the server
        // action -- on success the server action redirects (and this
        // page unmounts), on failure the user lands back here and can
        // restart fresh rather than seeing a stale draft restore on
        // top of their corrected fields.
        try {
          window.localStorage.removeItem(NEW_MATCH_DRAFT_KEY);
        } catch {}
        return action(fd);
      }}
      className="space-y-4"
      onSubmit={(e) => {
        // Belt-and-suspenders: even if a stray Enter / replay-click on
        // the sticky CTA tries to fire submit before the user has
        // reached the final step, swallow it. The "Open market" button
        // (rendered only on the last step) is the only legitimate path.
        if (step !== lastStep) {
          e.preventDefault();
        }
      }}
    >
      {/* Extra hidden inputs the parent needs submitted with the form
          (e.g. matchId in edit mode). Kept inside this <form> so they
          actually post -- nesting a second <form> would not. */}
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {/* Step header: progress dots + back arrow + step title. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className={
            "text-mute hover:text-ink text-sm w-10 " +
            (step === 0 ? "invisible" : "")
          }
          aria-label="Previous step"
        >
          ←
        </button>
        <div className="flex items-center gap-1.5">
          {visibleSteps.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === step
                  ? "w-6 bg-accent"
                  : i < step
                    ? "w-1.5 bg-accent/60"
                    : "w-1.5 bg-border")
              }
            />
          ))}
        </div>
        <span className="w-10 text-right text-[10px] uppercase tracking-wider text-mute">
          {step + 1}/{visibleSteps.length}
        </span>
      </div>

      <div className="text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {STEPS[step].title}
        </h2>
      </div>

      {/* Step 1: Course + tee + scoring + visibility + notes.
          Guided progressive reveal: one group at a time, completed ones
          collapse to editable chips. roundStep drives it. */}
      <div hidden={step !== 0} className="card p-5 space-y-4">
        {roundStep > 0 && (
          <StepChip
            label="Course"
            value={courseName || "—"}
            onEdit={() => setRoundStep(0)}
          />
        )}
        <div
          hidden={roundStep !== 0}
          className={roundStep === 0 ? "field-active" : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <label className="label" htmlFor="courseName">
              Course
            </label>
            <button
              type="button"
              onClick={findNearbyCourses}
              disabled={locating}
              className="text-[11px] text-mute hover:text-ink underline disabled:opacity-50"
            >
              {locating ? "Locating…" : "Find course near me"}
            </button>
          </div>
          <input
            id="courseName"
            name="courseName"
            className="input"
            placeholder="Search 500+ courses…"
            value={courseName}
            onChange={(e) => onCourseChange(e.target.value)}
            onFocus={() => setCourseFocused(true)}
            onBlur={() => setCourseFocused(false)}
            autoComplete="off"
          />
          {/* Nearby list only renders when the input is empty -- once
              the user starts typing we step aside so the focused
              search dropdown can show real matches. */}
          {!courseName.trim() &&
            nearby &&
            nearby.filter((c) => c.name !== courseName).length > 0 && (
            <div className="mt-1.5 border border-border rounded-md divide-y divide-border bg-panel/40 overflow-hidden">
              <div className="px-2.5 py-1 text-[9.5px] uppercase tracking-wider text-mute bg-panel2/40">
                Nearby — tap to pick, or search above
              </div>
              {nearby.filter((c) => c.name !== courseName).map((c) => {
                const miles = c.yards / 1760;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      onCourseChange(c.name);
                      setNearby(null);
                      setRoundStep((s) => (s === 0 ? 1 : s));
                    }}
                    className="w-full text-left px-2.5 py-2 text-sm hover:bg-panel/70 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10.5px] font-mono text-mute shrink-0">
                      {miles < 0.5
                        ? `${c.yards}y`
                        : `${miles.toFixed(miles < 10 ? 1 : 0)}mi`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* Focus-triggered course search dropdown. Hidden when the
              "Find course near me" list is active to avoid overlap.
              Recent picks float above the catalog matches. onMouseDown
              + preventDefault keeps the input from blurring before the
              click registers, so taps select cleanly. */}
          {/* Show search dropdown when focused AND either the user is
              typing (so the nearby list has stepped aside) or there
              isn't a nearby list at all. */}
          {courseFocused &&
            (courseName.trim().length > 0 ||
              !(nearby && nearby.length > 0)) &&
            courseResults.length > 0 && (
              <div className="mt-1.5 border border-border rounded-md bg-panel/95 backdrop-blur overflow-hidden max-h-72 overflow-y-auto">
                {recentCourses.length > 0 && !courseName.trim() && (
                  <>
                    <div className="px-2.5 py-1 text-[9.5px] uppercase tracking-wider text-mute bg-panel2/40">
                      Recent
                    </div>
                    {recentCourses.map((c) => (
                      <button
                        key={`recent-${c}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onCourseChange(c);
                          setCourseFocused(false);
                          setRoundStep((s) => (s === 0 ? 1 : s));
                        }}
                        className="w-full text-left px-2.5 py-2 text-sm hover:bg-panel/70 border-b border-border last:border-b-0"
                      >
                        {c}
                      </button>
                    ))}
                    <div className="px-2.5 py-1 text-[9.5px] uppercase tracking-wider text-mute bg-panel2/40 border-y border-border">
                      All courses
                    </div>
                  </>
                )}
                <div className="divide-y divide-border">
                  {courseResults.map((p) => {
                    const totalPar = p.pars.reduce((a, b) => a + b, 0);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onCourseChange(p.name);
                          setCourseFocused(false);
                          setRoundStep((s) => (s === 0 ? 1 : s));
                        }}
                        className="w-full text-left px-2.5 py-2 hover:bg-panel/70 block"
                      >
                        <div className="text-sm leading-tight">{p.name}</div>
                        <div className="text-[10.5px] text-mute font-mono mt-0.5">
                          {p.city} · {p.region} · par {totalPar} · {p.holes}H ·{" "}
                          {p.access}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {matchedPreset ? (
            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
              <div className="text-mute leading-relaxed">
                <span className="text-accent font-medium">
                  {matchedPreset.name}
                </span>
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>
                  {matchedPreset.city} · {matchedPreset.region} ·{" "}
                  <span className="text-ink">
                    par {matchedPreset.pars.reduce((a, b) => a + b, 0)}
                  </span>{" "}
                  · {matchedPreset.holes}H · {matchedPreset.access}
                </span>
              </div>
              <span className="chip self-start sm:self-auto shrink-0">
                pars autofilled
              </span>
            </div>
          ) : courseName.trim().length > 0 ? (
            <p className="text-[11px] text-mute mt-1">
              <span className="text-danger">Course not in our catalog.</span>{" "}
              Pick from the list above, or{" "}
              <a
                href="mailto:support@sticks.app?subject=Add%20a%20course"
                className="underline hover:text-ink"
              >
                reach out to support
              </a>{" "}
              if you don&apos;t see your favorite course yet.
            </p>
          ) : (
            <p className="text-[11px] text-mute mt-1">
              Pick from our 500+ pre-mapped courses.{" "}
              <a
                href="mailto:support@sticks.app?subject=Add%20a%20course"
                className="underline hover:text-ink"
              >
                Reach out to support
              </a>{" "}
              if you don&apos;t see your favorite course on the list yet.
            </p>
          )}
          {roundStep === 0 && (
            <button
              type="button"
              onClick={() => setRoundStep(1)}
              disabled={!matchedPreset}
              className="btn btn-primary w-full mt-3 disabled:opacity-50"
            >
              {matchedPreset ? "Continue →" : "Pick a course to continue"}
            </button>
          )}
        </div>

        {roundStep > 1 && (
          <StepChip
            label="Tee & holes"
            value={`${formatTeeShort(scheduledAt)} · ${
              holes === 18 ? "18 holes" : startingHole === 10 ? "Back 9" : "Front 9"
            }`}
            onEdit={() => setRoundStep(1)}
          />
        )}
        {/* `hidden` class (not attribute) because the `grid` display
            utility would otherwise override the [hidden] attribute and
            leak the tee/holes row onto the Course step. */}
        <div
          // Tee time only needs room for "M/D" + "h:mma" (~6 chars
          // per line); Holes packs three buttons (Full 18 / Front 9 /
          // Back 9) and benefits from more horizontal room. 1:2 split
          // matches the actual content footprints.
          className={
            roundStep === 1
              ? "grid grid-cols-[1fr_2fr] gap-3 field-active"
              : "hidden"
          }
        >
          <div>
            <label className="label" htmlFor="scheduledAt">
              Tee time
            </label>
            <div className="relative">
              {/* Two-line tile (date over time) so the box matches the
                  height of the adjacent Holes picker (Full 18 / Front 9
                  / Back 9), which is also two lines (label over count).
                  min-h-[3.25rem] keeps the two columns at the same
                  height even when only one line of text is showing
                  (e.g. unparseable scheduledAt -> "—"). */}
              <div
                className="input text-center flex flex-col items-center justify-center leading-tight pointer-events-none select-none min-h-[3.25rem]"
                aria-hidden
              >
                {(() => {
                  const parts = formatTeeParts(scheduledAt);
                  if (!parts) {
                    return <span className="text-sm font-medium">—</span>;
                  }
                  return (
                    <>
                      <span className="text-sm font-medium">{parts.date}</span>
                      <span className="text-sm font-medium">{parts.time}</span>
                    </>
                  );
                })()}
              </div>
              <input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                aria-label="Tee time"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="label">Holes</label>
            {/* 3-option picker collapses the old "Holes + Which nine"
                pair into a single decision. Each option writes both
                state values so downstream (pars autofill, scorecard
                starting hole, ParsEditor) Just Works. */}
            <input type="hidden" name="holes" value={holes} />
            <input type="hidden" name="startingHole" value={startingHole} />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "18", holes: 18 as const, start: 1 as const, label: "Full 18" },
                  { key: "F9", holes: 9 as const, start: 1 as const, label: "Front 9" },
                  { key: "B9", holes: 9 as const, start: 10 as const, label: "Back 9" },
                ] as const
              ).map((opt) => {
                const active = holes === opt.holes && startingHole === opt.start;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      onHolesChange(opt.holes);
                      setStartingHole(opt.start);
                      // Holes is the decisive tap in the tee+holes group.
                      setRoundStep((s) => (s === 1 ? 2 : s));
                    }}
                    className={
                      "flex items-center justify-center rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                      (active
                        ? "border-accent bg-accent/10 text-ink"
                        : "border-border text-mute hover:text-ink")
                    }
                    aria-pressed={active}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {roundStep === 1 && (
          <button
            type="button"
            onClick={() => setRoundStep(2)}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            Continue →
          </button>
        )}

        {roundStep > 2 && (
          <StepChip
            label="Format"
            value={`${
              format === "SCRAMBLE"
                ? "Teams"
                : format === "BOTH"
                  ? "Individual and Team"
                  : "Individual"
            } · ${
              format === "SCRAMBLE"
                ? `Team ${scrambleHcpMode.toLowerCase()}`
                : MODE_COPY[scoringMode].label
            }`}
            onEdit={() => setRoundStep(2)}
          />
        )}
        {/* Match format. Individual is the existing all-vs-all play;
            scramble is 2 teams sharing one ball-per-team-per-hole.
            When scramble is selected, the scoring picker below
            collapses into the team-handicap picker -- individual
            handicap math doesn't apply when only the team's score
            counts. */}
        <div
          hidden={roundStep !== 2}
          className={roundStep === 2 ? "field-active" : undefined}
        >
          <label className="label">Number of players</label>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                [1, "Solo"],
                [2, "Twosome"],
                [3, "Threesome"],
                [4, "Foursome+"],
              ] as const
            ).map(([n, label]) => {
              // The top preset means "4 or more" -- it stays selected as
              // you add players (up to 8) on the next step, and clicking
              // it never shrinks a bigger group back down to 4.
              const active = n === 4 ? players.length >= 4 : players.length === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    n === 4
                      ? players.length < 4 && setPlayerCount(4)
                      : setPlayerCount(n)
                  }
                  className={
                    "flex items-center justify-center rounded-md border px-1 py-2 transition min-h-[2.75rem] " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <span className="text-[12px] font-medium">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5 mb-4">
            {players.length === 1
              ? "Solo round — no opponents, no odds. Just log your card."
              : players.length < 4
                ? "Add more players in the next step or bump the size up to unlock team formats."
                : `${players.length} players — add up to 8 on the next step. Unlocks Teams (one ball per side) and Individual + Team scoring.`}
          </p>
          {players.length > 1 && (
            <>
          <label className="label">Round format</label>
          {/* "Both" is a client-side shortcut for INDIVIDUAL + the
              TEAM_VS_TEAM side game. Server still receives
              format=INDIVIDUAL; the side-games hidden inputs +
              tvtRule carry the team-vs-team config. */}
          <input
            type="hidden"
            name="format"
            value={format === "BOTH" ? "INDIVIDUAL" : format}
          />
          <input
            type="hidden"
            name="scrambleConfig"
            value={
              format === "SCRAMBLE"
                ? JSON.stringify({
                    handicapMode: scrambleHcpMode,
                    ...(scrambleHcpMode === "CUSTOM"
                      ? {
                          customAllowance: {
                            0: Number(scrambleCustomA) || 0,
                            1: Number(scrambleCustomB) || 0,
                          },
                        }
                      : {}),
                  })
                : ""
            }
          />
          {/* Multi-rule team config. Each checked rule becomes one
              entry; Vegas-only options ride along when VEGAS is
              checked. Server reads this only when TEAM_VS_TEAM is in
              the side-games list (auto-added by the useEffect when
              format = SCRAMBLE or BOTH). */}
          <input
            type="hidden"
            name="tvtConfig"
            value={JSON.stringify({
              rules: Array.from(tvtRules).map((r) => ({
                rule: r,
                ...(r === "VEGAS"
                  ? {
                      vegas: {
                        birdieFlip: vegasBirdieFlip,
                        doubleHoles: vegasDoubleHoles,
                      },
                    }
                  : {}),
              })),
            })}
          />
          <input
            type="hidden"
            name="targetsConfig"
            value={
              sideGames.has("TARGETS")
                ? JSON.stringify({
                    stat: targetsStat,
                    target: Number(targetsTarget) || 0,
                    ante: Number(targetsAnte) || 0,
                  })
                : ""
            }
          />
          {/* Skins + Wolf push rules. Empty value when the game isn't
              enabled so the action ignores it; otherwise a JSON blob
              with the chosen pushRule that gets persisted to
              SideGame.config. */}
          <input
            type="hidden"
            name="skinsConfig"
            value={
              sideGames.has("SKINS")
                ? JSON.stringify({ pushRule: skinsPushRule })
                : ""
            }
          />
          <input
            type="hidden"
            name="wolfConfig"
            value={
              sideGames.has("WOLF")
                ? JSON.stringify({ pushRule: wolfPushRule })
                : ""
            }
          />
          {/* Sixes config: just a per-dot wager for v1. */}
          <input
            type="hidden"
            name="sixesConfig"
            value={
              sideGames.has("SIXES")
                ? JSON.stringify({ stake: Number(sixesStake) || 0 })
                : ""
            }
          />
          {/* Stableford scale: modified sends a custom points table;
              WHS sends an empty object so the default scale applies. */}
          <input
            type="hidden"
            name="stablefordConfig"
            value={
              sideGames.has("STABLEFORD")
                ? JSON.stringify(
                    stablefordModified ? { points: stablefordPoints } : {},
                  )
                : ""
            }
          />
          {/* BBB per-event points (default 1 each). */}
          <input
            type="hidden"
            name="bbbConfig"
            value={
              sideGames.has("BBB")
                ? JSON.stringify({
                    points: {
                      bingo: Number(bbbPoints.bingo) || 0,
                      bango: Number(bbbPoints.bango) || 0,
                      bongo: Number(bbbPoints.bongo) || 0,
                    },
                  })
                : ""
            }
          />
          {/* Snake stake + doubling. */}
          <input
            type="hidden"
            name="snakeConfig"
            value={
              sideGames.has("SNAKE")
                ? JSON.stringify({
                    stake: Number(snakeStake) || 0,
                    ...(snakeDoubling ? { doubling: true } : {}),
                  })
                : ""
            }
          />
          {/* Nassau auto-press + stake. */}
          <input
            type="hidden"
            name="nassauConfig"
            value={
              sideGames.has("NASSAU")
                ? JSON.stringify({
                    ...(nassauAutoPress
                      ? {
                          autoPress: true,
                          autoPressThreshold: Number(nassauThreshold) || 2,
                        }
                      : {}),
                    ...(Number(nassauStake) > 0
                      ? { stake: Number(nassauStake) }
                      : {}),
                  })
                : ""
            }
          />
          {/* Match config -- keyed by player row index so the server
              action can map to the matchPlayerIds it just created. */}
          <input
            type="hidden"
            name="matchConfig"
            value={
              sideGames.has("MATCH")
                ? JSON.stringify({
                    strokesMode: matchStrokesMode,
                    manualStrokesByIndex: players.map(
                      (_, i) => Number(matchManualStrokes[i] ?? "0") || 0,
                    ),
                    autoPress: matchAutoPress,
                    autoPressThreshold:
                      Number(matchAutoPressThreshold) || 2,
                    stake: Number(matchStake) || 0,
                  })
                : ""
            }
          />
          <div className={`grid gap-2 ${players.length >= 4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {(["INDIVIDUAL", "SCRAMBLE", "BOTH"] as const)
              .filter((f) => {
                // Teams (Scramble) needs 4 players (2v2 ball-per-team).
                // Individual vs Team needs >= 2; with 3 we keep it
                // hidden since teams can't be even.
                if (f === "SCRAMBLE") return players.length >= 4;
                if (f === "BOTH") return players.length >= 4;
                return true;
              })
              .map((f) => {
              const active = format === f;
              const label =
                f === "INDIVIDUAL"
                  ? "Individual"
                  : f === "SCRAMBLE"
                    ? "Teams"
                    : "Individual and Team";
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={
                    "flex items-center justify-center rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5">
            {format === "INDIVIDUAL"
              ? "Every player keeps their own score; live odds price each player to win the match."
              : format === "SCRAMBLE"
                ? "Players split into 2 teams; live odds price team-vs-team."
                : "Each player keeps their own score AND teams are scored from those individual scores. Live odds still price players individually; a team-vs-team side game tracks the team competition."}
          </p>
            </>
          )}
        </div>

        {/* Scoring picker shows for INDIVIDUAL or BOTH (BOTH still
            uses individual handicap math; the team handicap mode in
            the SCRAMBLE branch doesn't apply). Solo rounds skip it
            entirely -- there's no opponent so Net vs Gross is
            cosmetic; default Net carries through. */}
        <div hidden={roundStep !== 2 || format === "SCRAMBLE" || isSolo}>
          <label className="label">Round scoring</label>
          <input type="hidden" name="scoringMode" value={scoringMode} />
          <div
            className={`grid gap-2 ${format === "INDIVIDUAL" ? "grid-cols-2" : "grid-cols-3"}`}
          >
            {(Object.keys(MODE_COPY) as ScoringMode[])
              // Custom strokes are a group-handicapping device -- only
              // meaningful when there's more than one player and a
              // shared agreement on allowances. Hide it on Individual
              // (which includes solo) where Net + Gross cover every
              // case.
              .filter((m) => !(m === "CUSTOM" && format === "INDIVIDUAL"))
              .map((m) => {
              const active = scoringMode === m;
              const c = MODE_COPY[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    changeScoringMode(m);
                    // Individual: scoring is the last decision in this
                    // group, so a tap completes it. Teams/Both still have
                    // team config below, so they use Continue.
                    if (format === "INDIVIDUAL") setRoundStep((s) => (s < 3 ? 3 : s));
                  }}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <span className="text-sm font-medium leading-none">
                    {c.label}
                  </span>
                  <span className="text-[10px] leading-none opacity-70">
                    {c.sub}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5">{modeCopy.help}</p>
        </div>

        {/* Scramble team-handicap picker. Replaces the individual
            scoring picker above when format=SCRAMBLE. Stays above
            the team rule picker so the "what's the allowance" decision
            sits in the same slot as "what's the scoring" for the
            Individual format. */}
        <div hidden={roundStep !== 2 || format !== "SCRAMBLE"}>
          <label className="label">Team handicap</label>
          <div className="grid grid-cols-3 gap-2">
            {(["GROSS", "AVG", "CUSTOM"] as const).map((m) => {
              const active = scrambleHcpMode === m;
              const label =
                m === "GROSS" ? "Gross" : m === "AVG" ? "Avg" : "Custom";
              const sub =
                m === "GROSS"
                  ? "No allowance"
                  : m === "AVG"
                    ? "Mean of HCPs"
                    : "Group decides";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScrambleHcpMode(m)}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <span className="text-sm font-medium leading-none">
                    {label}
                  </span>
                  <span className="text-[10px] leading-none opacity-70">
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>
          {scrambleHcpMode === "CUSTOM" && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-mute font-mono">
                  Team A strokes
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={scrambleCustomA}
                  onChange={(e) => setScrambleCustomA(e.target.value)}
                  placeholder="0"
                  className="input mt-1 text-center"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-mute font-mono">
                  Team B strokes
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={scrambleCustomB}
                  onChange={(e) => setScrambleCustomB(e.target.value)}
                  placeholder="0"
                  className="input mt-1 text-center"
                />
              </label>
            </div>
          )}
          <p className="text-[11px] text-mute mt-1.5">
            {scrambleHcpMode === "GROSS"
              ? "Pure team score with no handicap adjustment -- most casual scrambles."
              : scrambleHcpMode === "AVG"
                ? "Each team's allowance = average of teammate handicaps. Simple, fair on lopsided teams."
                : "Group decides each team's allowance manually -- type the strokes per team above."}
          </p>
        </div>

        {/* Team rule picker shows under Both AND Teams. For Both it
            sits below the individual scoring picker; for Teams it
            sits below the team handicap picker -- handicap-first
            mirrors how "what's the allowance" lives above the scoring
            details on the Individual flow. */}
        <div hidden={roundStep !== 2 || (format !== "BOTH" && format !== "SCRAMBLE")}>
          <label className="label">Team rules</label>
          <p className="text-[10.5px] text-mute mb-2 leading-snug">
            Pick one or more — each runs simultaneously with its own
            leaderboard.
          </p>
          <div className="space-y-1.5">
            {TEAM_VS_TEAM_RULES.map((r) => {
              const active = tvtRules.has(r);
              return (
                <div
                  key={r}
                  className={
                    "rounded-md border transition-colors " +
                    (active
                      ? "border-accent/60 bg-accent/5"
                      : "border-border hover:border-accent/30")
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggleTvtRule(r)}
                    aria-pressed={active}
                    className="w-full flex items-start gap-2.5 px-2.5 py-1.5 text-left"
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      readOnly
                      className="mt-0.5 shrink-0 accent-accent pointer-events-none"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium">
                        {teamVsTeamRuleLabel(r)}
                      </span>
                      <span className="block text-[10px] text-mute leading-tight mt-0.5">
                        {teamVsTeamRuleBlurb(r)}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-2">
            How each hole's team score is computed from the players'
            individual strokes. Assign players to Team A or B on the
            Players step.
          </p>
          {tvtRules.has("VEGAS") && (
            <div className="mt-2 rounded-md border border-border bg-panel2/40 p-2.5 space-y-2.5">
              <div className="text-[10px] uppercase tracking-wider text-mute">
                Vegas options
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vegasBirdieFlip}
                  onChange={(e) => setVegasBirdieFlip(e.target.checked)}
                  className="mt-0.5 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium">
                    Birdie flip
                  </span>
                  <span className="block text-[10.5px] text-mute leading-snug">
                    When a team birdies, the other team&apos;s score flips
                    (high digit goes first).
                  </span>
                </span>
              </label>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-mute mb-1">
                  Double holes (tied-hole multiplier)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["OFF", "Off"],
                      ["INCREMENTAL", "2× 3× 4×"],
                      ["EXPONENTIAL", "2× 4× 8×"],
                    ] as const
                  ).map(([val, label]) => {
                    const isActive = vegasDoubleHoles === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setVegasDoubleHoles(val)}
                        className={
                          "rounded-md border px-2 py-1.5 text-[12px] " +
                          (isActive
                            ? "border-accent bg-accent/10 text-ink"
                            : "border-border text-mute hover:text-ink")
                        }
                        aria-pressed={isActive}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <p className="text-[12px] text-mute mt-3 leading-snug">
            Players split into 2 teams; live odds price team-vs-team.
          </p>
        </div>
        {roundStep === 2 && (
          <button
            type="button"
            onClick={() => setRoundStep(3)}
            className="btn btn-primary w-full"
          >
            Continue →
          </button>
        )}

        {roundStep === 0 && templates.length > 0 && (
          <div className="rounded-md border border-border bg-panel2/60">
            <button
              type="button"
              onClick={() => setTemplatesOpen((v) => !v)}
              className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left"
              aria-expanded={templatesOpen}
            >
              <span className="flex items-start gap-2 min-w-0">
                <span aria-hidden className="mt-0.5">↺</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      Start from a past round
                    </span>
                    <span className="font-mono text-[10px] text-mute">
                      {templates.length}
                    </span>
                  </span>
                  <span className="block text-[11px] text-mute mt-0.5 leading-snug">
                    Copy course, holes, scoring, players, and side games
                    from one of your previous matches -- everything is
                    still editable after.
                  </span>
                </span>
              </span>
              <span className="text-mute text-xs shrink-0">
                {templatesOpen ? "Hide" : "Show"}
              </span>
            </button>
            {templatesOpen && (
              <ul className="border-t border-border divide-y divide-border max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full px-3 py-2 text-left hover:bg-panel transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-medium text-ink truncate">
                          {t.courseName}
                        </div>
                        <div className="text-[10px] text-mute font-mono shrink-0">
                          {new Date(t.scheduledAt).toLocaleDateString(
                            undefined,
                            { month: "numeric", day: "numeric", year: "2-digit" },
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-mute mt-0.5 truncate">
                        {t.holes}H
                        {t.startingHole === 10 ? " (back)" : ""} · {MODE_COPY[t.scoringMode].label} ·{" "}
                        {t.players.length} player
                        {t.players.length === 1 ? "" : "s"}
                        {t.sideGames.length > 0 && (
                          <> · {t.sideGames.length} side game{t.sideGames.length === 1 ? "" : "s"}</>
                        )}
                      </div>
                      <div className="text-[10px] text-mute mt-0.5 truncate">
                        {t.players.map((p) => p.name).join(" · ")}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {roundStep >= 3 && (
          <>
        <div>
          <label className="label" htmlFor="groupId">
            Visible to
          </label>
          <select
            id="groupId"
            name="groupId"
            className="input"
            defaultValue={defaultGroupId}
          >
            <option value="public">Public - anyone signed in</option>
            {groups.length > 0 && (
              <optgroup label="My groups">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} (members only)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {groups.length === 0 && (
            <p className="text-[11px] text-mute mt-1">
              Want a private round?{" "}
              <a className="text-accent" href="/groups">
                Create a group →
              </a>
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="notes">
            Notes <span className="text-mute normal-case">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            className="input"
            placeholder="Skins game, $5 closeouts, etc."
            defaultValue={initial?.notes ?? ""}
          />
        </div>
          </>
        )}
      </div>

      {/* Step 2: Players */}
      <div hidden={step !== 1} className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Players
            </h2>
            <p className="text-[11px] text-mute mt-0.5">
              {scoringMode === "CUSTOM"
                ? "Set strokes given per player — group's call."
                : scoringMode === "GROSS"
                  ? "Lowest gross wins; handicap is informational."
                  : "Lowest gross minus handicap wins."}
            </p>
            {scoringMode !== "CUSTOM" &&
              players.some((p) => p.handicapPending) && (
                <p className="text-[10.5px] text-mute mt-1 italic">
                  Sticks index pending for{" "}
                  {players
                    .filter((p) => p.handicapPending)
                    .map((p) => p.name)
                    .filter(Boolean)
                    .join(", ") || "one player"}
                  {" "}— log 3+ rounds to auto-fill. Enter a value for now.
                </p>
              )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {availableRosterPlayers && availableRosterPlayers.length > 0 && (
              <RosterPickerButton
                roster={availableRosterPlayers}
                pickedNames={new Set(
                  players.map((p) => p.name.toLowerCase()),
                )}
                disabled={players.length >= MAX_PLAYERS}
                onPick={(p) =>
                  setPlayers((rows) => {
                    if (rows.length >= MAX_PLAYERS) return rows;
                    const team0 = rows.filter((r) => r.team === 0).length;
                    const team1 = rows.filter((r) => r.team === 1).length;
                    return [
                      ...rows,
                      {
                        name: p.name,
                        handicap: p.handicap || "15",
                        userId: p.userId,
                        team: team0 <= team1 ? 0 : 1,
                      },
                    ];
                  })
                }
              />
            )}
            <button
              type="button"
              onClick={addPlayer}
              className="btn btn-ghost text-xs shrink-0"
              disabled={players.length >= MAX_PLAYERS}
            >
              + Add player
            </button>
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-1.5 px-1">
          <div className="flex-1" />
          <div className="w-20 shrink-0 text-center">
            <span className="text-[10px] uppercase tracking-wider text-mute font-mono whitespace-nowrap">
              {scoringMode === "CUSTOM" ? "Strokes given" : "Handicap"}
            </span>
          </div>
          <div className="w-8 shrink-0" />
        </div>
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex gap-2 items-start">
                <PlayerNameInput
                  value={p.name}
                  userId={p.userId}
                  // Block re-picking a Sticks account that's already
                  // taken by another row. The current row's own pick
                  // is omitted so the suggestion list still includes
                  // them (e.g. if the user clears + re-types).
                  excludeUserIds={players
                    .map((pp, j) => (j !== i ? pp.userId : null))
                    .filter((id): id is string => !!id)}
                  onChange={(next) => {
                    // When the user picks a linked Sticks account we
                    // also receive their auto-computed index. Real
                    // index -> prefill the handicap field. Null index
                    // (pending: <3 rounds logged) -> blank field +
                    // pending flag so the row italicizes and surfaces
                    // the "3+ rounds" note below.
                    if (next.userId && next.handicapIndex != null) {
                      setPlayer(i, {
                        name: next.name,
                        userId: next.userId,
                        handicap: next.handicapIndex.toFixed(1),
                        handicapPending: false,
                      });
                    } else if (next.userId) {
                      setPlayer(i, {
                        name: next.name,
                        userId: next.userId,
                        handicap: "",
                        handicapPending: true,
                      });
                    } else {
                      // Unlinked / free-typed name -- leave the
                      // handicap alone and clear the pending flag.
                      setPlayer(i, {
                        name: next.name,
                        userId: next.userId,
                        handicapPending: false,
                      });
                    }
                  }}
                  placeholder={`Player ${i + 1}`}
                />
                <input
                  name="playerHandicap"
                  type="number"
                  step={scoringMode === "CUSTOM" ? "1" : "0.1"}
                  min={0}
                  value={p.handicap}
                  onChange={(e) =>
                    // A manual edit means the user is taking ownership
                    // of the value -- clear the pending italic so the
                    // field reads like any other entry.
                    setPlayer(i, {
                      handicap: e.target.value,
                      handicapPending: false,
                    })
                  }
                  placeholder={p.handicapPending ? "pending" : modeCopy.field}
                  title={
                    p.handicapPending
                      ? "Sticks index unlocks after 3+ logged rounds — enter a value for now."
                      : scoringMode === "CUSTOM"
                        ? `Strokes given to ${p.name || `player ${i + 1}`}`
                        : modeCopy.field
                  }
                  aria-label={
                    scoringMode === "CUSTOM"
                      ? `Strokes given to ${p.name || `player ${i + 1}`}`
                      : modeCopy.field
                  }
                  aria-invalid={
                    Number.isNaN(parseFloat(p.handicap)) ? true : undefined
                  }
                  className={
                    "input w-20 shrink-0 text-center px-2 " +
                    (Number.isNaN(parseFloat(p.handicap))
                      ? // Empty / non-numeric handicap blocks the Next
                        // button; red ring makes it obvious which
                        // row still needs attention.
                        "border-danger ring-1 ring-danger/40 "
                      : "") +
                    (p.handicapPending
                      ? "italic placeholder:italic text-mute placeholder:text-mute border-dashed"
                      : "")
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost px-2 shrink-0"
                  onClick={() => removePlayer(i)}
                  disabled={players.length <= 1}
                  aria-label={`Remove player ${i + 1}`}
                  title="Remove player"
                >
                  <RemoveIcon />
                </button>
              </div>
              {/* Hidden input always submits a team value (default 0
                  for individual matches; server ignores it unless
                  format=SCRAMBLE). The visible Team A/B chips only
                  render when scramble is active. */}
              <input type="hidden" name="playerTeam" value={String(p.team)} />
              {/* Per-player tee. One playerTee is always submitted (in
                  row order) to stay parallel with playerHandicap: a
                  <select> when the course has tees, else an empty
                  hidden input so the server falls back to the course
                  default. Keyed on course so it re-defaults on change. */}
              {courseTees.tees.length > 0 ? (
                <div className="flex items-center gap-1.5 pl-1">
                  <span className="text-[10px] uppercase tracking-wider text-mute font-mono">
                    Tee
                  </span>
                  <select
                    key={matchedPreset?.name ?? "none"}
                    name="playerTee"
                    defaultValue={defaultTeeValue}
                    className="input py-1 text-xs max-w-[16rem]"
                    aria-label={`Tee for ${p.name || `player ${i + 1}`}`}
                  >
                    {courseTees.tees.map((t) => (
                      <option key={`${t.name}|${t.gender}`} value={`${t.name}|${t.gender}`}>
                        {t.name} · {t.gender} · {t.rating.toFixed(1)}/{t.slope}
                        {t.yardage ? ` · ${t.yardage}y` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input type="hidden" name="playerTee" value="" />
              )}
              {(format === "SCRAMBLE" || sideGames.has("TEAM_VS_TEAM")) && (
                <div className="flex items-center gap-1.5 pl-1">
                  <span className="text-[10px] uppercase tracking-wider text-mute font-mono">
                    Team
                  </span>
                  {([0, 1] as const).map((t) => {
                    const active = p.team === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPlayer(i, { team: t })}
                        className={
                          "h-6 px-2.5 rounded-full text-[11px] font-medium border transition " +
                          (active
                            ? "border-accent bg-accent/10 text-ink"
                            : "border-border text-mute hover:text-ink")
                        }
                        aria-pressed={active}
                      >
                        {t === 0 ? "A" : "B"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-3">
          {isSolo
            ? "Solo round — no opponents, no side games. Hit Start round to log your card."
            : "Crowd picks and live scoring shift the line from there. Playing solo is fine — drop everyone else to log just your round."}
        </p>
      </div>

      {/* Step 3: Side games + review */}
      <div hidden={step !== 2} className="space-y-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-base font-semibold text-ink">
              Side games
            </h2>
            <span className="text-[11px] text-mute">{sideGames.size} on</span>
          </div>
          <p className="text-[11px] text-mute mb-3">
            Side games are <span className="text-ink">optional</span>. Pick any
            you&apos;d like to track below &mdash; or just open the market to
            get started.
          </p>
          <p className="text-[10.5px] text-faint mb-3 rounded-md border border-border bg-panel2/40 px-2.5 py-2">
            Any dollar amounts just help Sticks tally who owes whom. Sticks
            only keeps score &mdash; no money is collected, held, or paid
            through the app. Settle up among yourselves.
          </p>
          <OpenMarketButton label="Start round →" />
          <div className="flex items-center gap-3 my-3">
            <div className="h-px flex-1 bg-borderSoft" />
            <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
              or add side games
            </span>
            <div className="h-px flex-1 bg-borderSoft" />
          </div>
          <div className="space-y-2">
            {/* TEAM_VS_TEAM is intentionally hidden from this list --
                the only way to enable it is via the "Both" format
                option on step 0, which also exposes the rule picker
                inline. Pulling it from the checkbox list keeps INDIV
                matches from showing an irrelevant team toggle. */}
            {ALL_SIDE_GAMES.filter((g) => {
              // TEAM_VS_TEAM is never in this list -- it's only
              // reachable via the format picker on step 0.
              if (g.kind === "TEAM_VS_TEAM") return false;
              // Teams (SCRAMBLE) logs ONE score per team per hole, so
              // any side game that needs per-player scores (Stableford,
              // Skins, Nassau, BBB, Wolf) has nothing to score against.
              // Snake is event-based (3-putts) and works fine in
              // scramble -- whoever takes the third putt holds the
              // snake regardless of which ball the team played.
              if (format === "SCRAMBLE" && g.kind !== "SNAKE") return false;
              return true;
            }).map((g) => {
              const disabledByHoles = g.requires18 && holes !== 18;
              const disabledByPlayers =
                g.requires4Players && players.length !== 4;
              const disabled = disabledByHoles || disabledByPlayers;
              const active = sideGames.has(g.kind);
              const disabledReason = disabledByHoles
                ? "Needs 18 holes"
                : disabledByPlayers
                  ? "Needs exactly 4 players"
                  : null;
              return (
                <div key={g.kind}>
                  <label
                    className={
                      "flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors " +
                      (disabled
                        ? "border-border opacity-50 cursor-not-allowed"
                        : active
                          ? "border-accent/50 bg-accent/5"
                          : "border-border hover:border-accent/30")
                    }
                  >
                    <input
                      type="checkbox"
                      name="sideGame"
                      value={g.kind}
                      checked={active && !disabled}
                      onChange={() => !disabled && toggleSideGame(g.kind)}
                      disabled={disabled}
                      className="mt-0.5 shrink-0 accent-accent"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{g.label}</div>
                      <div className="text-[11px] text-mute">
                        {disabledReason ?? g.blurb}
                      </div>
                    </div>
                  </label>
                  {/* Match inline config: stroke-giving mode + per-
                      player manual strokes when MANUAL is picked. */}
                  {g.kind === "SKINS" && active && !disabled && (
                    <PushRuleConfig
                      title="On tied holes"
                      value={skinsPushRule}
                      options={[
                        {
                          value: "CARRYOVER",
                          label: "Carry over",
                          help: "Skin rolls to the next hole. The next non-tied hole pays out the carry.",
                        },
                        {
                          value: "NO_CARRY",
                          label: "No carry",
                          help: "Tied hole pays no skin. Next hole starts fresh at 1.",
                        },
                      ]}
                      onChange={(v) =>
                        setSkinsPushRule(v as "CARRYOVER" | "NO_CARRY")
                      }
                    />
                  )}
                  {g.kind === "WOLF" && active && !disabled && (
                    <PushRuleConfig
                      title="On tied / pushed holes"
                      value={wolfPushRule}
                      options={[
                        {
                          value: "NO_POINTS",
                          label: "No points",
                          help: "Pushed hole pays nothing, next hole reset to 1x.",
                        },
                        {
                          value: "ROLLOVER",
                          label: "Roll over",
                          help: "Push raises a multiplier; the next resolved hole pays double (or more).",
                        },
                      ]}
                      onChange={(v) =>
                        setWolfPushRule(v as "NO_POINTS" | "ROLLOVER")
                      }
                    />
                  )}
                  {g.kind === "MATCH" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-mute mb-1">
                          Stroke-giving
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              ["AUTO", "By handicap"],
                              ["MANUAL", "Manual"],
                            ] as const
                          ).map(([val, label]) => {
                            const isActive = matchStrokesMode === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setMatchStrokesMode(val)}
                                className={
                                  "rounded-md border px-2 py-1.5 text-[12px] " +
                                  (isActive
                                    ? "border-accent bg-accent/10 text-ink"
                                    : "border-border text-mute hover:text-ink")
                                }
                                aria-pressed={isActive}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {matchStrokesMode === "MANUAL" && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-mute">
                            Strokes (for Match only)
                          </div>
                          {players.map((p, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 text-[12px]"
                            >
                              <span className="truncate text-mute">
                                {p.name || `Player ${i + 1}`}
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={holes * 2}
                                value={matchManualStrokes[i] ?? ""}
                                placeholder="0"
                                onChange={(e) =>
                                  setMatchManualStrokes((s) => ({
                                    ...s,
                                    [i]: e.target.value,
                                  }))
                                }
                                className="input w-16 text-center text-sm py-1"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Auto-press: 2-player matches only. */}
                      <label
                        className={
                          "flex items-start gap-2.5 cursor-pointer " +
                          (players.length !== 2 ? "opacity-50" : "")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={matchAutoPress && players.length === 2}
                          disabled={players.length !== 2}
                          onChange={(e) => setMatchAutoPress(e.target.checked)}
                          className="mt-0.5 shrink-0 accent-accent"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-medium">
                            Auto press
                          </span>
                          <span className="block text-[10.5px] text-mute leading-snug">
                            {players.length === 2
                              ? "New press line starts each time the lead crosses the threshold."
                              : "2-player matches only."}
                          </span>
                        </span>
                      </label>
                      {matchAutoPress && players.length === 2 && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-mute">
                            Threshold (down by)
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={holes}
                            value={matchAutoPressThreshold}
                            onChange={(e) =>
                              setMatchAutoPressThreshold(e.target.value)
                            }
                            className="input w-16 text-center text-sm py-1"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Stake
                        </label>
                        <span className="text-[12px] text-mute">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
                          value={matchStake}
                          placeholder="0"
                          onChange={(e) => setMatchStake(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                        <span className="text-[10.5px] text-mute">per dot</span>
                      </div>
                    </div>
                  )}
                  {/* Targets inline config: stat picker + per-player
                      target number. Only shown when the game is
                      actually selected. */}
                  {g.kind === "SIXES" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Stake
                        </label>
                        <span className="text-[12px] text-mute">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
                          value={sixesStake}
                          placeholder="0"
                          onChange={(e) => setSixesStake(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                        <span className="text-[10.5px] text-mute">per dot</span>
                      </div>
                    </div>
                  )}
                  {g.kind === "STABLEFORD" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-mute">
                        Scoring scale
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            [false, "Standard (WHS)"],
                            [true, "Modified"],
                          ] as const
                        ).map(([mod, label]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              setStablefordModified(mod);
                              if (mod)
                                setStablefordPoints(STABLEFORD_MODIFIED_POINTS);
                            }}
                            className={
                              "rounded-md border px-2 py-1.5 text-[12px] " +
                              (stablefordModified === mod
                                ? "border-accent bg-accent/10 text-ink"
                                : "border-border text-mute hover:text-ink")
                            }
                            aria-pressed={stablefordModified === mod}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {stablefordModified && (
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          {(
                            [
                              ["albatross", "Albatross+"],
                              ["eagle", "Eagle"],
                              ["birdie", "Birdie"],
                              ["par", "Par"],
                              ["bogey", "Bogey"],
                              ["double", "Dbl+"],
                            ] as const
                          ).map(([k, label]) => (
                            <label key={k} className="text-[11px]">
                              <span className="block text-mute mb-0.5">
                                {label}
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                step={1}
                                value={String(stablefordPoints[k])}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  setStablefordPoints((prev) => ({
                                    ...prev,
                                    [k]: Number.isFinite(n)
                                      ? Math.trunc(n)
                                      : prev[k],
                                  }));
                                }}
                                className="input w-full text-center text-sm py-1"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="text-[10.5px] text-mute leading-snug">
                        {stablefordModified
                          ? "Points per result vs par; negatives allowed."
                          : `WHS: birdie ${STABLEFORD_WHS_POINTS.birdie}, par ${STABLEFORD_WHS_POINTS.par}, bogey ${STABLEFORD_WHS_POINTS.bogey}, double+ ${STABLEFORD_WHS_POINTS.double}.`}
                      </p>
                    </div>
                  )}
                  {g.kind === "BBB" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-mute">
                        Points per event
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ["bingo", "Bingo"],
                            ["bango", "Bango"],
                            ["bongo", "Bongo"],
                          ] as const
                        ).map(([k, label]) => (
                          <label key={k} className="text-[11px]">
                            <span className="block text-mute mb-0.5">
                              {label}
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={bbbPoints[k]}
                              onChange={(e) =>
                                setBbbPoints((prev) => ({
                                  ...prev,
                                  [k]: e.target.value,
                                }))
                              }
                              className="input w-full text-center text-sm py-1"
                            />
                          </label>
                        ))}
                      </div>
                      <p className="text-[10.5px] text-mute leading-snug">
                        First on the green, closest once on, first in the hole.
                        Default 1 each.
                      </p>
                    </div>
                  )}
                  {g.kind === "SNAKE" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Snake stake
                        </label>
                        <span className="text-[12px] text-mute">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
                          value={snakeStake}
                          placeholder="0"
                          onChange={(e) => setSnakeStake(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={snakeDoubling}
                          onChange={(e) => setSnakeDoubling(e.target.checked)}
                          className="accent-accent"
                        />
                        <span className="text-mute">
                          Double the pot each time the snake is passed
                        </span>
                      </label>
                      <p className="text-[10.5px] text-mute leading-snug">
                        Last player to 3-putt holds the snake and owes the pot.
                      </p>
                    </div>
                  )}
                  {g.kind === "NASSAU" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={nassauAutoPress}
                          onChange={(e) => setNassauAutoPress(e.target.checked)}
                          className="accent-accent"
                        />
                        <span className="text-mute">
                          Auto-press when a side goes 2 down
                        </span>
                      </label>
                      {nassauAutoPress && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-mute whitespace-nowrap">
                            Press when down
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={nassauThreshold}
                            onChange={(e) => setNassauThreshold(e.target.value)}
                            className="input w-16 text-center text-sm py-1"
                          />
                          <span className="text-[10.5px] text-mute">holes</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Stake
                        </label>
                        <span className="text-[12px] text-mute">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
                          value={nassauStake}
                          placeholder="0"
                          onChange={(e) => setNassauStake(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                        <span className="text-[10.5px] text-mute">per bet</span>
                      </div>
                      <p className="text-[10.5px] text-mute leading-snug">
                        Front, back &amp; total bets. Presses apply to 2-player
                        rounds.
                      </p>
                    </div>
                  )}
                  {g.kind === "TARGETS" && active && !disabled && (
                    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-mute mb-1">
                          Stat
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              ["PAR_OR_BETTER", "Pars or better"],
                              ["BIRDIE_OR_BETTER", "Birdies or better"],
                            ] as const
                          ).map(([val, label]) => {
                            const isActive = targetsStat === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setTargetsStat(val)}
                                className={
                                  "rounded-md border px-2 py-1.5 text-[12px] " +
                                  (isActive
                                    ? "border-accent bg-accent/10 text-ink"
                                    : "border-border text-mute hover:text-ink")
                                }
                                aria-pressed={isActive}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Target (per player)
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={holes}
                          value={targetsTarget}
                          onChange={(e) => setTargetsTarget(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                        <span className="text-[11px] text-mute">
                          of {holes}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-mute whitespace-nowrap">
                          Ante (per player)
                        </label>
                        <span className="text-[12px] text-mute">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
                          value={targetsAnte}
                          placeholder="0"
                          onChange={(e) => setTargetsAnte(e.target.value)}
                          className="input w-20 text-center text-sm py-1"
                        />
                        <span className="text-[10.5px] text-mute leading-snug">
                          Winners split losers&apos; antes; all-hit or no-hit refunds.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {COMING_SOON_SIDE_GAMES.map((g) => (
              <div
                key={g.kind}
                className="flex items-start gap-3 rounded-md border border-border px-3 py-2 opacity-50"
              >
                <input
                  type="checkbox"
                  disabled
                  className="mt-0.5 shrink-0"
                  aria-label={`${g.label} (coming soon)`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center justify-between gap-2">
                    <span>{g.label}</span>
                    <span className="chip text-[10px]">Coming soon</span>
                  </div>
                  <div className="text-[11px] text-mute">{g.blurb}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ReviewCard
          courseName={courseName}
          holes={holes}
          startingHole={startingHole}
          scoringMode={scoringMode}
          playerCount={players.filter((p) => p.name.trim()).length}
          sideGameCount={sideGames.size}
        />
      </div>

      {parsToSubmit && (
        <input
          type="hidden"
          name="parData"
          value={JSON.stringify(parsToSubmit)}
        />
      )}

      {/* Sticky bottom action. Next while we're on steps 1 & 2; submit
          on the final step. Distinct `key`s + `type=button` on Next make
          sure a stray replayed click can't morph into a form submit. */}
      <div className="sticky bottom-2 pt-2">
        {step < lastStep ? (
          // During the guided Round reveal the inline "Continue" buttons
          // drive progress; the sticky Next appears once it's complete.
          step === 0 && roundStep < 3 ? null : (
          <button
            key="next"
            type="button"
            onClick={tryNext}
            disabled={!canAdvance}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {step === 0 && !canAdvance
              ? "Pick a course from the list to continue"
              : step === 1 && !canAdvance
                ? "Fill in every player to continue"
                : "Next →"}
          </button>
          )
        ) : (
          // Solo rounds finalize on the Players step (no Side games to
          // pick), so the bottom CTA flips to "Start round" right there.
          <OpenMarketButton
            label={
              isSolo && !submitLabel ? "Start round →" : submitLabel
            }
          />
        )}
      </div>
    </form>
  );
}

// Roster picker for tournament foursomes. Surfaces the players who are
// in the tournament roster but not yet in this foursome's player list.
// Two-option radio-style picker for the Skins / Wolf push rule. Lives
// inside the side-game card's inline config strip; reuses the same
// rounded-md card the Match config uses so the visual rhythm is the
// same regardless of which game is being configured.
function PushRuleConfig({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: { value: string; label: string; help: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-mute">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((o) => {
          const isActive = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={
                "rounded-md border px-2 py-1.5 text-left " +
                (isActive
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-border text-mute hover:text-ink")
              }
              aria-pressed={isActive}
            >
              <div className="text-[12px] font-medium">{o.label}</div>
              <div className="text-[10px] leading-snug text-mute mt-0.5">
                {o.help}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tap once to open the dropdown, tap a name to add them. Hides itself
// when no roster members are left to pick.
function RosterPickerButton({
  roster,
  pickedNames,
  disabled,
  onPick,
}: {
  roster: { name: string; handicap: string; userId: string | null }[];
  pickedNames: Set<string>;
  disabled: boolean;
  onPick: (p: { name: string; handicap: string; userId: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const remaining = roster.filter(
    (p) => !pickedNames.has(p.name.toLowerCase()),
  );
  if (remaining.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="btn btn-ghost text-xs shrink-0"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        + From roster ({remaining.length})
      </button>
      {open && (
        <ul
          className="absolute right-0 mt-1 z-30 rounded-md border border-border bg-panel max-h-64 overflow-y-auto shadow-lg min-w-[14rem]"
          role="listbox"
        >
          {remaining.map((p) => (
            <li key={(p.userId ?? "") + p.name}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-panel2"
              >
                <span className="text-ink">{p.name}</span>
                {p.handicap && (
                  <span className="font-mono text-[10.5px] text-mute ml-2">
                    HCP {p.handicap}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Submit button that disables itself once the server action is in
// flight. Without this, a double-tap (or a slow network nudging the
// user to retry) creates duplicate matches.
function OpenMarketButton({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  const idle = label ?? "Start round";
  const busy = label ? "Saving…" : "Starting round…";
  return (
    <button
      key="submit"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? busy : idle}
    </button>
  );
}

// Collapsed summary of a completed wizard group. Tap to jump back and
// edit that decision.
function StepChip({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full flex items-center justify-between gap-2 rounded-md border border-borderSoft bg-panel2/40 px-3 py-2 text-left hover:border-accent/40 transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="text-accent text-sm leading-none">✓</span>
        <span className="text-[10px] uppercase tracking-wider text-mute shrink-0">
          {label}
        </span>
        <span className="text-sm text-ink truncate">{value}</span>
      </span>
      <span className="text-[11px] text-mute shrink-0">Edit</span>
    </button>
  );
}

function ReviewCard({
  courseName,
  holes,
  startingHole,
  scoringMode,
  playerCount,
  sideGameCount,
}: {
  courseName: string;
  holes: 9 | 18;
  startingHole: 1 | 10;
  scoringMode: ScoringMode;
  playerCount: number;
  sideGameCount: number;
}) {
  const ninesLabel =
    holes === 18 ? "18" : startingHole === 10 ? "Back 9" : "Front 9";
  return (
    <div className="card p-5">
      <h2 className="font-display text-base font-semibold text-ink mb-2">
        Review
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-mute">Course</dt>
        <dd className="text-ink truncate text-right">
          {courseName || <span className="text-faint">—</span>}
        </dd>
        <dt className="text-mute">Holes</dt>
        <dd className="text-ink text-right">{ninesLabel}</dd>
        <dt className="text-mute">Scoring</dt>
        <dd className="text-ink text-right">{MODE_COPY[scoringMode].label}</dd>
        <dt className="text-mute">Players</dt>
        <dd className="text-ink text-right">{playerCount}</dd>
        <dt className="text-mute">Side games</dt>
        <dd className="text-ink text-right">
          {sideGameCount === 0 ? "None" : sideGameCount}
        </dd>
      </dl>
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// "2026-05-17T21:00" -> "5/17 · 9:00pm". Falls back to the raw string
// if parsing fails; "—" for empty.
function formatTeeShort(iso: string): string {
  const parts = formatTeeParts(iso);
  if (!parts) return iso || "—";
  return `${parts.date} · ${parts.time}`;
}

// Split form of formatTeeShort used by the picker tile so the date
// and time render on two lines (matching the height of the Holes
// picker tiles next to it). Returns null when the input doesn't
// parse so the caller can fall back to whatever it wants.
function formatTeeParts(iso: string): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  let hours = d.getHours();
  const mins = d.getMinutes();
  const isPM = hours >= 12;
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const m = mins === 0 ? "" : `:${String(mins).padStart(2, "0")}`;
  const time = `${hours}${m}${isPM ? "pm" : "am"}`;
  return { date, time };
}
