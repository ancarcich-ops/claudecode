"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  type SideGameKind,
  type TeamVsTeamRule,
} from "@/lib/sideGames";

type NearbyCourse = { name: string; yards: number };

type PlayerRow = {
  name: string;
  handicap: string;
  userId: string | null;
  // Team assignment used only when format === "SCRAMBLE". Default 0
  // for even indices, 1 for odd, so an unedited 4-player match opens
  // as a clean 2v2 split.
  team: 0 | 1;
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

export default function NewMatchForm({
  action,
  defaultPlayerName,
  defaultPlayerHandicap = "12",
  currentUserId,
  recentCourses,
  presets,
  groups,
  defaultGroupId,
  templates = [],
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  // Pre-filled handicap for the creator's seat. Comes from their computed
  // Sticks index when available; the parent supplies the fallback string.
  defaultPlayerHandicap?: string;
  currentUserId: string;
  recentCourses: string[];
  presets: CoursePreset[];
  groups: { id: string; name: string }[];
  defaultGroupId: string;
  // Cloneable past rounds; tapping one pre-fills the whole wizard.
  templates?: MatchTemplate[];
}) {
  const [step, setStep] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([
    {
      name: defaultPlayerName,
      handicap: defaultPlayerHandicap,
      userId: currentUserId,
      team: 0,
    },
    { name: "", handicap: "15", userId: null, team: 1 },
  ]);
  const [sideGames, setSideGames] = useState<Set<SideGameKind>>(new Set());

  const toggleSideGame = (kind: SideGameKind) =>
    setSideGames((curr) => {
      const next = new Set(curr);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const [courseName, setCourseName] = useState("");
  const [nearby, setNearby] = useState<NearbyCourse[] | null>(null);
  // Controls visibility of the custom course-search dropdown. iOS
  // Safari's native <datalist> renders as 3 chips on the keyboard
  // accessory bar, which is useless for browsing a 500-course
  // catalog -- so the dropdown is a regular scrollable list below
  // the input that opens on focus.
  const [courseFocused, setCourseFocused] = useState(false);
  const [locating, startLocating] = useTransition();
  const [holes, setHoles] = useState<9 | 18>(18);
  // 1 = full or front 9, 10 = back 9. Only meaningful when holes === 9.
  const [startingHole, setStartingHole] = useState<1 | 10>(1);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("NET");
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
    "INDIVIDUAL",
  );
  const [scrambleHcpMode, setScrambleHcpMode] = useState<
    "GROSS" | "AVG" | "CUSTOM"
  >("GROSS");
  // Custom per-team allowances, only used when scrambleHcpMode is
  // CUSTOM. Strings instead of numbers so the input is comfortable
  // to type in (leading 0s, partial entries during edit, etc.); the
  // submitted scrambleConfig coerces to numbers.
  const [scrambleCustomA, setScrambleCustomA] = useState("");
  const [scrambleCustomB, setScrambleCustomB] = useState("");
  // Team-vs-Team side game configuration. The team picker (chips
  // per player row) shares state with the SCRAMBLE format's chips
  // -- PlayerRow.team is the single source of truth and surfaces
  // whenever EITHER scramble is the format OR the TEAM_VS_TEAM
  // side game is enabled.
  const [tvtRule, setTvtRule] = useState<TeamVsTeamRule>("BEST_BALL");

  // Keep sideGames in sync with the format picker. Both Teams
  // (SCRAMBLE) and Both auto-enable TEAM_VS_TEAM so the rule picker
  // above actually drives a team-vs-team leaderboard. INDIVIDUAL
  // doesn't auto-toggle anything -- the user can still pick side
  // games manually on step 2.
  useEffect(() => {
    if (format === "BOTH" || format === "SCRAMBLE") {
      setSideGames((curr) => {
        if (curr.has("TEAM_VS_TEAM")) return curr;
        const next = new Set(curr);
        next.add("TEAM_VS_TEAM");
        return next;
      });
    }
  }, [format]);

  const presetByName = useMemo(() => {
    const m = new Map<string, CoursePreset>();
    for (const p of presets) m.set(p.name.toLowerCase(), p);
    return m;
  }, [presets]);

  const matchedPreset = presetByName.get(courseName.trim().toLowerCase());

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

  // Auto-prefill the nearest course on mount if the input is empty.
  // Runs once -- if location is denied or unavailable, fail silently
  // (the manual "Find course near me" button stays available with its
  // usual loud-failure messaging). Skips entirely when the input has
  // already been filled (template clone, browser back nav, etc.).
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
            // Only fill when nothing's been typed in the meantime --
            // the geo callback can fire after the user started typing.
            if (r.length > 0 && !courseName.trim()) {
              onCourseChange(r[0].name);
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
    players.length < 6 &&
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
  };

  // Controlled tee-time string in the same shape as <input
  // type="datetime-local"> expects ("YYYY-MM-DDTHH:mm"). We control it
  // so we can show our own short label ("5/17 · 9:00pm") on top of an
  // invisible native input -- the picker still works, but the visible
  // text isn't the OS's wordy default that overflows the half-width
  // box on phones.
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 0);
    if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
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
    if (step === 0) return courseName.trim().length > 0;
    if (step === 1) {
      return players.every(
        (p) => p.name.trim().length > 0 && !Number.isNaN(parseFloat(p.handicap)),
      );
    }
    return true;
  })();

  const tryNext = () => {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(e) => {
        // Belt-and-suspenders: even if a stray Enter / replay-click on
        // the sticky CTA tries to fire submit before the user has
        // reached the final step, swallow it. The "Open market" button
        // (rendered only on the last step) is the only legitimate path.
        if (step !== STEPS.length - 1) {
          e.preventDefault();
        }
      }}
    >
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
          {STEPS.map((_, i) => (
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
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div className="text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {STEPS[step].title}
        </h2>
      </div>

      {/* Step 1: Course + tee + scoring + visibility + notes */}
      <div hidden={step !== 0} className="card p-5 space-y-4">
        <div>
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
            placeholder="Start typing - Riviera, Pelican Hill, Rancho Park..."
            value={courseName}
            onChange={(e) => onCourseChange(e.target.value)}
            onFocus={() => setCourseFocused(true)}
            onBlur={() => setCourseFocused(false)}
            autoComplete="off"
          />
          {nearby && nearby.length > 0 && (
            <div className="mt-1.5 border border-border rounded-md divide-y divide-border bg-panel/40 overflow-hidden">
              {nearby.map((c) => {
                const miles = c.yards / 1760;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      onCourseChange(c.name);
                      setNearby(null);
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
          {courseFocused &&
            !(nearby && nearby.length > 0) &&
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
          ) : (
            <p className="text-[11px] text-mute mt-1">
              Pick from our pre-mapped courses or type any course name to
              add new courses to the list.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="scheduledAt">
              Tee time
            </label>
            <div className="relative">
              <div
                className="input text-center flex items-center justify-center pointer-events-none select-none"
                aria-hidden
              >
                {formatTeeShort(scheduledAt)}
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

        {/* Match format. Individual is the existing all-vs-all play;
            scramble is 2 teams sharing one ball-per-team-per-hole.
            When scramble is selected, the scoring picker below
            collapses into the team-handicap picker -- individual
            handicap math doesn't apply when only the team's score
            counts. */}
        <div>
          <label className="label">Format</label>
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
          {/* Always submitted; server reads it only when
              TEAM_VS_TEAM is in the side-games list (which auto-
              happens when format=BOTH via the useEffect invariant). */}
          <input type="hidden" name="tvtRule" value={tvtRule} />
          <div className="grid grid-cols-3 gap-2">
            {(["INDIVIDUAL", "SCRAMBLE", "BOTH"] as const).map((f) => {
              const active = format === f;
              const label =
                f === "INDIVIDUAL"
                  ? "Individual"
                  : f === "SCRAMBLE"
                    ? "Teams"
                    : "Both";
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
                ? "Players split into 2 teams. Each team logs one score per hole; live odds price team-vs-team."
                : "Each player keeps their own score AND teams are scored from those individual scores. Live odds still price players individually; a team-vs-team side game tracks the team competition."}
          </p>
        </div>

        {/* Scoring picker shows for INDIVIDUAL or BOTH (BOTH still
            uses individual handicap math; the team handicap mode in
            the SCRAMBLE branch doesn't apply). */}
        <div hidden={format === "SCRAMBLE"}>
          <label className="label">Scoring</label>
          <input type="hidden" name="scoringMode" value={scoringMode} />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_COPY) as ScoringMode[]).map((m) => {
              const active = scoringMode === m;
              const c = MODE_COPY[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeScoringMode(m)}
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
        <div hidden={format !== "SCRAMBLE"}>
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
        <div hidden={format !== "BOTH" && format !== "SCRAMBLE"}>
          <label className="label">Team rule</label>
          <div className="grid grid-cols-2 gap-1.5">
            {TEAM_VS_TEAM_RULES.map((r) => {
              const active = tvtRule === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTvtRule(r)}
                  className={
                    "rounded-md border px-2.5 py-1.5 text-left transition-colors " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <div className="text-[12px] font-medium">
                    {teamVsTeamRuleLabel(r)}
                  </div>
                  <div className="text-[10px] text-mute leading-tight mt-0.5">
                    {teamVsTeamRuleBlurb(r)}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5">
            How each hole's team score is computed from the players'
            individual strokes. Assign players to Team A or B on the
            Players step.
          </p>
        </div>

        {templates.length > 0 && (
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
          />
        </div>
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
          </div>
          <button
            type="button"
            onClick={addPlayer}
            className="btn btn-ghost text-xs shrink-0"
            disabled={players.length >= 6}
          >
            + Add player
          </button>
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
                  onChange={(next) =>
                    setPlayer(i, { name: next.name, userId: next.userId })
                  }
                  placeholder={`Player ${i + 1}`}
                />
                <input
                  name="playerHandicap"
                  type="number"
                  step={scoringMode === "CUSTOM" ? "1" : "0.1"}
                  min={0}
                  value={p.handicap}
                  onChange={(e) => setPlayer(i, { handicap: e.target.value })}
                  placeholder={modeCopy.field}
                  title={
                    scoringMode === "CUSTOM"
                      ? `Strokes given to ${p.name || `player ${i + 1}`}`
                      : modeCopy.field
                  }
                  aria-label={
                    scoringMode === "CUSTOM"
                      ? `Strokes given to ${p.name || `player ${i + 1}`}`
                      : modeCopy.field
                  }
                  className="input w-20 shrink-0 text-center px-2"
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
          Crowd wagers and live scoring shift the line from there. Playing
          solo is fine — drop everyone else to log just your round.
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
            Track extra games alongside the main{" "}
            {modeCopy.label.toLowerCase()} match. Leaderboards update live as
            scores come in.
          </p>
          <div className="space-y-2">
            {/* TEAM_VS_TEAM is intentionally hidden from this list --
                the only way to enable it is via the "Both" format
                option on step 0, which also exposes the rule picker
                inline. Pulling it from the checkbox list keeps INDIV
                matches from showing an irrelevant team toggle. */}
            {ALL_SIDE_GAMES.filter((g) => g.kind !== "TEAM_VS_TEAM").map((g) => {
              const disabledByHoles = g.requires18 && holes !== 18;
              const active = sideGames.has(g.kind);
              return (
                <label
                  key={g.kind}
                  className={
                    "flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors " +
                    (disabledByHoles
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
                    checked={active && !disabledByHoles}
                    onChange={() =>
                      !disabledByHoles && toggleSideGame(g.kind)
                    }
                    disabled={disabledByHoles}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-[11px] text-mute">
                      {disabledByHoles ? "Needs 18 holes" : g.blurb}
                    </div>
                  </div>
                </label>
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
        {step < STEPS.length - 1 ? (
          <button
            key="next"
            type="button"
            onClick={tryNext}
            disabled={!canAdvance}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {step === 0 && !canAdvance
              ? "Add a course to continue"
              : step === 1 && !canAdvance
                ? "Fill in every player to continue"
                : "Next →"}
          </button>
        ) : (
          <button
            key="submit"
            type="submit"
            className="btn btn-primary w-full"
          >
            Open market
          </button>
        )}
      </div>
    </form>
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  let hours = d.getHours();
  const mins = d.getMinutes();
  const isPM = hours >= 12;
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const m = mins === 0 ? "" : `:${String(mins).padStart(2, "0")}`;
  return `${month}/${day} · ${hours}${m}${isPM ? "pm" : "am"}`;
}
