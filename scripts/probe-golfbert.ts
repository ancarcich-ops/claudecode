// Cheap pre-flight check for the Golfbert credentials. Hits the
// status endpoint + one concrete-course read so a stale key shows up
// before we burn the daily import budget. ~2 API calls; aborts on
// the first non-2xx.
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//     npx tsx scripts/probe-golfbert.ts

import "./_load-env";
import * as gb from "../src/lib/golfbert";

async function main() {
  const haveAll =
    !!process.env.GOLFBERT_API_KEY &&
    !!process.env.GOLFBERT_ACCESS_KEY &&
    !!process.env.GOLFBERT_SECRET_KEY;
  if (!haveAll) {
    console.error(
      "Missing one or more env vars: GOLFBERT_API_KEY, GOLFBERT_ACCESS_KEY, GOLFBERT_SECRET_KEY",
    );
    process.exit(1);
  }

  console.log("1. status ping…");
  try {
    const status = await gb.ping();
    console.log(`   ✓ ${JSON.stringify(status)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`   ✗ ${msg}`);
    process.exit(2);
  }

  // Course id 1688 = Alondra Park (the first preset in the queue).
  // Should always exist if the key has any access at all.
  console.log("2. fetch course 1688 (Alondra Park)…");
  try {
    const c = await gb.getCourse(1688);
    console.log(`   ✓ ${c.name} -- ${c.city}, ${c.state}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`   ✗ ${msg}`);
    process.exit(3);
  }

  console.log("");
  console.log("Golfbert credentials are live. Calls used: " + gb.getGolfbertCallCount());
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
