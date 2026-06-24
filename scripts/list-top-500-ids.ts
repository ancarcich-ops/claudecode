// Build scripts/top-500-ids.txt -- the preset ids that came from the
// top-500 gap list (gb-search-gaps.ts), so the import script can be
// pointed at JUST those via --ids-from. Filters by reason="top-500..."
// on the per-state candidate JSONs, then joins with golfbert-state.json
// (matched on gbId) to recover the preset id (slug).
//
// Run:
//   npx tsx scripts/list-top-500-ids.ts
//
// Then:
//   npx tsx scripts/import-golfbert.ts --reuse-id --daily-budget=99999 \
//     --ids-from=scripts/top-500-ids.txt

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";

type Candidate = {
  gbId: number;
  name: string;
  reason: string;
};

type StateEntry = {
  kind?: string;
  presetId?: string;
  gbId?: number;
  dbImported?: boolean;
};

function main() {
  const stateRaw = JSON.parse(
    readFileSync("scripts/golfbert-state.json", "utf8"),
  ) as Record<string, StateEntry>;

  // Map gbId -> presetId for everything in state that's matched but
  // not yet imported (the import target).
  const gbIdToPreset = new Map<number, string>();
  for (const entry of Object.values(stateRaw)) {
    if (
      entry.kind === "matched" &&
      entry.dbImported === false &&
      entry.gbId != null &&
      entry.presetId
    ) {
      gbIdToPreset.set(entry.gbId, entry.presetId);
    }
  }

  // Walk every per-state candidate JSON and pull gbIds whose reason
  // starts with "top-500".
  const wantGbIds = new Set<number>();
  for (const f of readdirSync("scripts")) {
    if (!f.startsWith("discover-") || !f.endsWith("-candidates.json")) continue;
    const path = `scripts/${f}`;
    if (!existsSync(path)) continue;
    let cands: Candidate[];
    try {
      cands = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const c of cands) {
      if (c.reason?.startsWith("top-500")) wantGbIds.add(c.gbId);
    }
  }

  const ids: string[] = [];
  for (const gbId of wantGbIds) {
    const pid = gbIdToPreset.get(gbId);
    if (pid) ids.push(pid);
  }
  ids.sort();

  writeFileSync("scripts/top-500-ids.txt", ids.join("\n") + "\n");
  console.log(
    `Wrote scripts/top-500-ids.txt with ${ids.length} preset ids (of ${wantGbIds.size} top-500 gbIds; ${wantGbIds.size - ids.length} already imported or unmatched).`,
  );
}

main();
