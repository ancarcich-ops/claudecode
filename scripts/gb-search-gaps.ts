// Search Golfbert for every name in scripts/top-500-gaps.json, then
// write per-state candidate JSONs that merge-discovery-candidates.ts
// can consume directly. ~1 Golfbert call per gap (~330 total), so well
// inside the 3,572/day cap.
//
// Output:
//   scripts/discover-{state}-candidates.json  -- auto-matched candidates
//     ready for `--state=XX` merge. Appended to existing file if present.
//   scripts/gb-gaps-review.txt                -- no-match + multi-match
//     log for manual triage.
//   scripts/gb-gaps-progress.json             -- resume state. Re-running
//     skips entries already resolved.
//
// Usage (Windows PowerShell, where the Golfbert creds live):
//   npx tsx scripts/gb-search-gaps.ts
//
// Flags:
//   --limit=N      cap to N gap rows this run
//   --tier=T1      filter by tier (T1/T2/T3/T4/ADD). Default = all.
//   --state=XX     only this state.
//   --dry-run      no API calls; just print what would be searched.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import "./_load-env";
import * as gb from "../src/lib/golfbert";
import { COURSE_PRESETS } from "../src/lib/courses";

type Gap = {
  tier: string;
  rank: string;
  name: string;
  city: string;
  state: string;
  access: string;
  region: string;
  slug: string;
};

type Candidate = {
  gbId: number;
  name: string;
  city: string;
  state: string;
  zip?: string;
  suggestedRegion: string;
  reason: string;
};

type Progress = Record<
  string,
  { kind: "matched" | "no-match" | "multi-match" | "skipped"; gbId?: number; note?: string }
>;

const REVIEW_PATH = "scripts/gb-gaps-review.txt";
const PROGRESS_PATH = "scripts/gb-gaps-progress.json";

function parseFlags(argv: string[]) {
  const flags = { limit: 999, tier: "", state: "", dryRun: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--limit=")) flags.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith("--tier=")) flags.tier = a.slice(7).toUpperCase();
    else if (a.startsWith("--state=")) flags.state = a.slice(8).toUpperCase();
    else if (a === "--dry-run") flags.dryRun = true;
  }
  return flags;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const stop = new Set([
    "golf", "club", "course", "the", "and", "of", "at", "resort",
    "country", "links", "no",
  ]);
  return new Set(
    normalizeName(s)
      .split(" ")
      .filter((t) => t.length > 0 && !stop.has(t)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function loadProgress(): Progress {
  if (!existsSync(PROGRESS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveProgress(p: Progress) {
  writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

function appendReview(line: string) {
  appendFileSync(REVIEW_PATH, line + "\n");
}

function loadStateCandidates(path: string): Candidate[] {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

function saveStateCandidates(path: string, cands: Candidate[]) {
  writeFileSync(path, JSON.stringify(cands, null, 2));
}

async function main() {
  const flags = parseFlags(process.argv);
  const gaps: Gap[] = JSON.parse(readFileSync("scripts/top-500-gaps.json", "utf8"));
  const presetNames = new Set(COURSE_PRESETS.map((p) => normalizeName(p.name)));
  const progress = loadProgress();

  // Append a session header so reruns layer onto the same file
  appendFileSync(REVIEW_PATH, `\n# Session — ${new Date().toISOString()}\n\n`);

  // Filter + prioritize: T1 → T2 → ADD → T3 → T4
  const tierOrder = ["T1", "T2", "ADD", "T3", "T4", "?"];
  const filtered = gaps.filter((g) => {
    if (flags.tier && g.tier !== flags.tier) return false;
    if (flags.state && g.state !== flags.state) return false;
    if (presetNames.has(normalizeName(g.name))) return false; // already in catalog
    const prev = progress[g.slug];
    if (prev && prev.kind === "matched") return false; // resolved
    return true;
  });
  filtered.sort(
    (a, b) =>
      tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) ||
      a.state.localeCompare(b.state) ||
      a.rank.localeCompare(b.rank),
  );

  const batch = filtered.slice(0, flags.limit);
  console.log(`Searching ${batch.length} gaps (of ${filtered.length} unresolved)`);

  // Group candidate writes by state file so we don't reopen on every match
  const stateBuckets = new Map<string, Candidate[]>();
  const stateFile = (state: string) => `scripts/discover-${state.toLowerCase()}-candidates.json`;

  let matched = 0;
  let multi = 0;
  let none = 0;
  let calls = 0;

  for (const gap of batch) {
    if (flags.dryRun) {
      console.log(`  [dry] ${gap.tier} ${gap.state} | ${gap.name} (${gap.city})`);
      continue;
    }
    calls += 1;
    try {
      const resp = await gb.searchCourses({ name: gap.name, limit: 25 });
      const rows = resp.resources ?? [];
      // Filter to same state when known
      const inState = rows.filter((r) => (r.address?.state ?? "").toUpperCase() === gap.state);
      const candidates = inState.length > 0 ? inState : rows;

      const gapTokens = tokenize(gap.name);
      const scored = candidates
        .map((c) => ({
          c,
          score: tokenOverlap(gapTokens, tokenize(c.name ?? "")),
          cityMatch:
            !!gap.city &&
            !!c.address?.city &&
            normalizeName(gap.city) === normalizeName(c.address.city),
        }))
        .sort((a, b) => {
          if (a.cityMatch !== b.cityMatch) return a.cityMatch ? -1 : 1;
          return b.score - a.score;
        });

      const best = scored[0];
      const second = scored[1];

      const isStrong =
        best && (best.cityMatch || best.score >= 0.75) && best.c.id !== undefined;
      const isAmbiguous =
        best && second && best.score < 0.95 && Math.abs(best.score - second.score) < 0.15;

      if (!best || scored.length === 0) {
        none += 1;
        progress[gap.slug] = { kind: "no-match", note: gap.name };
        appendReview(
          `NO-MATCH  ${gap.tier} ${gap.state}  ${gap.name}  (${gap.city})`,
        );
      } else if (isStrong && !isAmbiguous) {
        matched += 1;
        const cand: Candidate = {
          gbId: best.c.id as number,
          name: best.c.name ?? gap.name,
          city: best.c.address?.city ?? gap.city,
          state: best.c.address?.state ?? gap.state,
          zip: best.c.address?.zip,
          suggestedRegion: gap.region,
          reason: `top-500 ${gap.tier}#${gap.rank}; matched on ${best.cityMatch ? "city+name" : `name ${(best.score * 100).toFixed(0)}%`}`,
        };
        const path = stateFile(gap.state);
        if (!stateBuckets.has(path)) stateBuckets.set(path, loadStateCandidates(path));
        const bucket = stateBuckets.get(path)!;
        if (!bucket.find((b) => b.gbId === cand.gbId)) bucket.push(cand);
        progress[gap.slug] = { kind: "matched", gbId: cand.gbId };
      } else {
        multi += 1;
        progress[gap.slug] = { kind: "multi-match", note: gap.name };
        appendReview(
          `MULTI     ${gap.tier} ${gap.state}  ${gap.name}  (${gap.city})`,
        );
        for (const s of scored.slice(0, 5)) {
          appendReview(
            `   -> ${s.c.id}  ${s.c.name}  ${s.c.address?.city ?? ""}, ${s.c.address?.state ?? ""}  (${(s.score * 100).toFixed(0)}%${s.cityMatch ? " +city" : ""})`,
          );
        }
        appendReview("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendReview(`ERROR     ${gap.state}  ${gap.name}: ${msg}`);
      if (msg.includes("429") || msg.includes("Limit Exceeded")) {
        console.log(`\nRate limit at ${calls} calls. Saving progress.`);
        break;
      }
    }
    // Persist every 10 calls so a crash loses little
    if (calls % 10 === 0) {
      saveProgress(progress);
      for (const [path, bucket] of stateBuckets) saveStateCandidates(path, bucket);
    }
    // Lightweight pacing — Golfbert tolerates ~1 req/sec comfortably
    await new Promise((r) => setTimeout(r, 250));
  }

  // Final flush
  saveProgress(progress);
  for (const [path, bucket] of stateBuckets) saveStateCandidates(path, bucket);

  console.log(`\nDone. Calls used: ~${calls}`);
  console.log(`  matched:     ${matched}`);
  console.log(`  multi-match: ${multi}  (see ${REVIEW_PATH})`);
  console.log(`  no-match:    ${none}   (see ${REVIEW_PATH})`);
  console.log(`\nState candidate files written:`);
  for (const path of stateBuckets.keys()) console.log(`  ${path}`);
  console.log(`\nNext step: merge per state, then run the importer:`);
  for (const path of stateBuckets.keys()) {
    const m = path.match(/discover-(\w+)-candidates/);
    if (m) console.log(`  npx tsx scripts/merge-discovery-candidates.ts --state=${m[1].toUpperCase()}`);
  }
  console.log(`  npx tsx scripts/import-golfbert.ts --reuse-id`);
}

main();
