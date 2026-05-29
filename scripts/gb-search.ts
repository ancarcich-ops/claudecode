// Ad-hoc GolfBert course search. Prints candidate course ids + names for
// each query term so you can resolve no-match / multi-match presets by
// hand, then pin them with:
//   npx tsx scripts/import-golfbert.ts --id=<preset-id> --gb-id=<number>
//
// Usage (each argument is one search, quote multi-word terms):
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//   npx tsx scripts/gb-search.ts "Costa Mesa" "Sepulveda" "Anaheim Hills"
//
// Each query is one API call, so a dozen terms is cheap. Searching a
// looser term than the catalog name (e.g. just "Costa Mesa") is the
// trick for courses our exact-name search missed.
import * as gb from "../src/lib/golfbert";

async function main() {
  const terms = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (terms.length === 0) {
    console.log('Usage: npx tsx scripts/gb-search.ts "Term one" "Term two" ...');
    process.exit(1);
  }
  for (const term of terms) {
    process.stdout.write(`\n=== "${term}" ===\n`);
    try {
      const resp = await gb.searchCourses({ name: term, limit: 25 });
      const rows = resp.resources ?? [];
      if (rows.length === 0) {
        console.log("  (no results)");
        continue;
      }
      for (const c of rows) {
        const city = c.address?.city ?? "";
        const state = c.address?.state ?? "";
        const loc = [city, state].filter(Boolean).join(", ");
        console.log(`  ${c.id}\t${c.name ?? "(no name)"}${loc ? ` — ${loc}` : ""}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR: ${msg}`);
      if (msg.includes("429") || msg.includes("Limit Exceeded")) {
        console.log("  GolfBert rate limit hit -- resume once the quota resets.");
        break;
      }
    }
  }
}

main();
