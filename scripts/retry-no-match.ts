// Retry the 32 "no-match" presets from scripts/golfbert-state.json.
//
// For each one we look up COURSE_PRESETS to recover the human-readable
// name + city + state, then try a handful of search variants against
// Golfbert -- the original single-shot match used the full preset name
// which sometimes contains a (parenthesized) course modifier that
// Golfbert spells differently.
//
// Variants tried per preset:
//   1. Full preset name + state filter
//   2. Base name (everything before the first paren / hyphen / "-")
//   3. Base name + city filter
//   4. The course-modifier-in-parens by itself (e.g. "Lake Course"),
//      no state -- helps when Golfbert tags the modifier as the
//      primary name and the resort goes in the location field.
//
// Output is grouped by preset: candidates printed with gb id, name,
// city, state. Hand-pick the matches and pin with:
//   npx tsx scripts/import-golfbert.ts --id=<preset-id> --gb-id=<n>
//
// Calls per preset: up to 4. 32 presets * 4 = 128 calls. Well inside
// the daily budget. We stop early when we see a high-confidence hit
// (exact case-insensitive name match in the right state).
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//     npx tsx scripts/retry-no-match.ts [--id=preset] [--id=preset]
//
// Flags:
//   --id=preset-id   Limit the run to one or more preset ids (repeat).

import { readFileSync } from "fs";
import { resolve } from "path";
import "./_load-env";
import * as gb from "../src/lib/golfbert";
import { COURSE_PRESETS } from "../src/lib/courses";

type StateEntry = {
  kind?: string;
  presetId?: string;
};

function parseFlags(argv: string[]) {
  const ids: string[] = [];
  for (const a of argv.slice(2)) {
    if (a.startsWith("--id=")) ids.push(a.slice("--id=".length));
  }
  return { ids };
}

// Strip a trailing "(Lake Course)" / "- Lake Course" suffix and return
// both halves. Used to build broader search variants.
function splitNameModifier(full: string): { base: string; modifier: string | null } {
  const m1 = full.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m1) return { base: m1[1].trim(), modifier: m1[2].trim() };
  const m2 = full.match(/^(.*?)\s+[-–]\s+(.+)$/);
  if (m2) return { base: m2[1].trim(), modifier: m2[2].trim() };
  return { base: full, modifier: null };
}

// "Pinehurst, NC" -> { city: "Pinehurst", state: "NC" }
function splitCity(loc: string): { city: string; state: string | null } {
  const parts = loc.split(",").map((s) => s.trim());
  return {
    city: parts[0] ?? "",
    state: parts[1] ?? null,
  };
}

type Candidate = { id: number; name: string; city: string; state: string };

function rowsToCandidates(rows: gb.GBCourse[]): Candidate[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "(no name)",
    city: r.address?.city ?? "",
    state: r.address?.state ?? "",
  }));
}

async function tryQuery(label: string, q: Parameters<typeof gb.searchCourses>[0]) {
  try {
    const resp = await gb.searchCourses({ limit: 20, ...q });
    const cands = rowsToCandidates(resp.resources ?? []);
    return { label, cands, err: null as string | null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label, cands: [] as Candidate[], err: msg };
  }
}

async function main() {
  const flags = parseFlags(process.argv);
  const statePath = resolve("scripts/golfbert-state.json");
  const state: StateEntry[] = JSON.parse(readFileSync(statePath, "utf8"));
  const noMatchIds = state
    .filter((s) => s.kind === "no-match" && s.presetId)
    .map((s) => s.presetId as string);
  const targetIds = flags.ids.length > 0 ? flags.ids : noMatchIds;

  console.log(`Retrying ${targetIds.length} no-match preset(s)...\n`);

  let rateLimited = false;
  for (const presetId of targetIds) {
    if (rateLimited) break;
    const preset = COURSE_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      console.log(`=== ${presetId} ===\n  (not found in COURSE_PRESETS, skipping)\n`);
      continue;
    }
    const { city, state: presetState } = splitCity(preset.city);
    const { base, modifier } = splitNameModifier(preset.name);

    console.log(`=== ${presetId}  ${preset.name} — ${preset.city} ===`);

    const seen = new Map<number, Candidate>();
    const queries: { label: string; q: Parameters<typeof gb.searchCourses>[0] }[] = [
      { label: `name="${preset.name}" state=${presetState ?? "?"}`, q: { name: preset.name, state: presetState ?? undefined } },
      { label: `name="${base}" state=${presetState ?? "?"}`, q: { name: base, state: presetState ?? undefined } },
      { label: `name="${base}" city="${city}"`, q: { name: base, city } },
    ];
    if (modifier) {
      queries.push({
        label: `name="${modifier}" state=${presetState ?? "?"}`,
        q: { name: modifier, state: presetState ?? undefined },
      });
    }

    for (const { label, q } of queries) {
      const out = await tryQuery(label, q);
      if (out.err) {
        console.log(`  ! ${label}: ${out.err}`);
        if (out.err.includes("429") || out.err.includes("Limit Exceeded")) {
          rateLimited = true;
          console.log("  -- rate limited, stopping --");
          break;
        }
        continue;
      }
      if (out.cands.length === 0) {
        console.log(`  - ${label}: no results`);
        continue;
      }
      console.log(`  + ${label}: ${out.cands.length} result(s)`);
      for (const c of out.cands) {
        if (seen.has(c.id)) continue;
        seen.set(c.id, c);
      }
    }

    if (seen.size === 0) {
      console.log(`  (no candidates)\n`);
      continue;
    }
    // Print de-duplicated candidates with a "*" next to ones whose name
    // (case-insensitive) contains every word of the preset's base name
    // -- a cheap "looks promising" hint.
    const baseTokens = base
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length >= 3);
    const ranked = Array.from(seen.values()).map((c) => {
      const lc = c.name.toLowerCase();
      const hits = baseTokens.filter((t) => lc.includes(t)).length;
      return { c, hits };
    });
    ranked.sort((a, b) => b.hits - a.hits);
    console.log("  Candidates:");
    for (const { c, hits } of ranked) {
      const marker = hits === baseTokens.length && baseTokens.length > 0 ? " *" : "";
      const loc = [c.city, c.state].filter(Boolean).join(", ");
      console.log(`    ${c.id}\t${c.name}${loc ? ` — ${loc}` : ""}${marker}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
