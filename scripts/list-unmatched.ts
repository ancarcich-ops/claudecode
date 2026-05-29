// Print every course in the GolfBert import state that still needs a
// manual --gb-id pairing: no-match, multi-match, or failed (e.g. the
// quota-429 failures). Joins the state file with the catalog so each
// line shows the real course name + city -- handy for going to find
// the GolfBert course id by hand.
//
//   npx tsx scripts/list-unmatched.ts
//
// Output is grouped by outcome and sorted by name. "failed" entries
// retry automatically on the next sweep, but listing them lets you
// pre-stage codes for the ones GolfBert genuinely doesn't have.

import { readFileSync } from "node:fs";
import { COURSE_PRESETS } from "../src/lib/courses";

type StateEntry = {
  kind: string;
  presetId: string;
  candidates?: { id: number; name: string; city?: string }[];
  error?: string;
};

const STATE_PATH = "scripts/golfbert-state.json";

function main() {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    console.error(`Could not read ${STATE_PATH} -- run an import first.`);
    process.exit(1);
  }
  const entries: StateEntry[] = Array.isArray(raw)
    ? (raw as StateEntry[])
    : (Object.values(raw as Record<string, StateEntry>) as StateEntry[]);

  const presetById = new Map(COURSE_PRESETS.map((p) => [p.id, p]));
  const unmatched = entries.filter(
    (e) => e.kind === "no-match" || e.kind === "multi-match" || e.kind === "failed",
  );

  const groups: Record<string, StateEntry[]> = {
    "multi-match": [],
    "no-match": [],
    failed: [],
  };
  for (const e of unmatched) (groups[e.kind] ??= []).push(e);

  const fmt = (e: StateEntry) => {
    const p = presetById.get(e.presetId);
    const name = p?.name ?? "(not in catalog)";
    const city = p?.city ?? "";
    let line = `  ${e.presetId.padEnd(34)} ${name}${city ? ` — ${city}` : ""}`;
    // Multi-matches already carry the candidate GolfBert ids -- print
    // them so you can just pick the right one (no hunting needed).
    if (e.kind === "multi-match" && e.candidates?.length) {
      line += "\n      candidates: " +
        e.candidates
          .map((c) => `${c.id} (${c.name}${c.city ? `, ${c.city}` : ""})`)
          .join("  |  ");
    }
    return line;
  };

  let total = 0;
  for (const kind of ["multi-match", "no-match", "failed"]) {
    const list = (groups[kind] ?? []).sort((a, b) =>
      (presetById.get(a.presetId)?.name ?? a.presetId).localeCompare(
        presetById.get(b.presetId)?.name ?? b.presetId,
      ),
    );
    if (list.length === 0) continue;
    total += list.length;
    console.log(`\n=== ${kind.toUpperCase()} (${list.length}) ===`);
    for (const e of list) console.log(fmt(e));
  }

  console.log(`\nTotal needing a manual code: ${total}`);
  console.log(
    `\nOnce you have the GolfBert ids, pair each with:\n  npx tsx scripts/import-golfbert.ts --id=<preset-id> --gb-id=<number>`,
  );
}

main();
