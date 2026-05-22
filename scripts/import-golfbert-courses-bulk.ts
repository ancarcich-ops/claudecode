// One-off bulk importer: walks the Golfbert match report produced by
// import-golfbert-pars.ts and pulls the FULL course payload (per-hole
// tee/green coords, fairway + green polygons, hazards, teeboxes) into
// the Course / CourseHole / CourseHazard tables for every matched
// preset.
//
// Pair with import-golfbert-pars.ts. The pars script handles the
// static catalog (committed to git). This script handles the
// DB-resident rich map data (polygons + hazards). Together they let
// you subscribe to Golfbert for one month, pull everything, then
// cancel -- pars persist in git, polygons + hazards persist in
// Postgres.
//
// Usage:
//   GOLFBERT_API_KEY=... GOLFBERT_ACCESS_KEY=... GOLFBERT_SECRET_KEY=... \
//   DATABASE_URL=postgres://... \
//     npx tsx scripts/import-golfbert-courses-bulk.ts \
//     [--dry-run] [--limit=N] [--id=preset-id] [--force]
//
// Flags:
//   --dry-run   Don't write to the DB; print what would be imported.
//   --limit=N   Process only the first N matched entries (smoke test).
//   --id=...    Process only one preset by id (repeatable).
//   --force     Re-import even if the course already has golfbert-
//               sourced holes (default skips them to be idempotent).
//
// Output:
//   Logs per-course progress. On error, the course is logged and the
//   script continues -- one bad course doesn't stop the batch.
//
// Idempotency: by default, skips courses whose CourseHole rows are
// already source="golfbert". Use --force to re-pull everything (it'll
// wipe existing golfbert hazards for the course before re-inserting,
// matching the live admin import flow).
//
// Storage estimate: ~50KB per course (polygons dominate). For 500
// courses this is ~25MB of Postgres -- a rounding error on most
// managed Postgres tiers.

import { readFileSync, existsSync } from "fs";
import { COURSE_PRESETS } from "../src/lib/courses";
import * as gb from "../src/lib/golfbert";
import { findOrCreateCourseByName } from "../src/lib/course";
import { prisma } from "../src/lib/db";

const REPORT_PATH = "scripts/golfbert-match-report.json";

type MatchedEntry = {
  kind: "matched";
  presetId: string;
  gbId: number;
  gbName: string;
  gbCity?: string;
  pars: number[];
};

type ReportEntry =
  | MatchedEntry
  | { kind: "no-match"; presetId: string }
  | { kind: "multi-match"; presetId: string }
  | { kind: "skipped"; presetId: string };

function parseCli() {
  const args = process.argv.slice(2);
  const flags = {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    limit: null as number | null,
    ids: [] as string[],
  };
  for (const a of args) {
    if (a.startsWith("--limit=")) {
      flags.limit = parseInt(a.slice("--limit=".length), 10);
    }
    if (a.startsWith("--id=")) flags.ids.push(a.slice("--id=".length));
  }
  return flags;
}

function loadReport(): ReportEntry[] {
  if (!existsSync(REPORT_PATH)) {
    console.error(
      `${REPORT_PATH} not found. Run scripts/import-golfbert-pars.ts first.`,
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(REPORT_PATH, "utf8")) as ReportEntry[];
}

async function alreadyImported(courseName: string): Promise<boolean> {
  // Course is considered imported if it has at least one CourseHole
  // row sourced from golfbert. Matches the admin flow's data model.
  const found = await prisma.courseHole.findFirst({
    where: {
      course: { name: courseName },
      source: "golfbert",
    },
    select: { id: true },
  });
  return found != null;
}

async function importOne(
  entry: MatchedEntry,
  preset: (typeof COURSE_PRESETS)[number],
  dryRun: boolean,
): Promise<{ holes: number; hazards: number }> {
  // Pull the full Golfbert payload (the heavy network round-trip).
  const imported = await gb.importCourseFromGolfBert(entry.gbId);

  if (dryRun) {
    return {
      holes: imported.holes.length,
      hazards: imported.holes.reduce((sum, h) => sum + h.hazards.length, 0),
    };
  }

  // Course row: created (or found) by display name -- matches how
  // matches reference the course in the rest of the app.
  const course = await findOrCreateCourseByName(preset.name);
  const pars = imported.holes.map((h) => h.par ?? 4);
  await prisma.course.update({
    where: { id: course.id },
    data: {
      centerLat: imported.centerLat ?? course.centerLat ?? undefined,
      centerLng: imported.centerLng ?? course.centerLng ?? undefined,
      parData: JSON.stringify(pars),
    },
  });

  // Wipe golfbert-sourced hazards for this course before re-inserting.
  // Matches the live admin import flow's behaviour -- without a source
  // column on CourseHazard we can't scope this more narrowly. v1 has
  // no user-marked hazards in production, so this is safe; if user-
  // marked hazards are added later, this script needs an update.
  await prisma.courseHazard.deleteMany({ where: { courseId: course.id } });

  let holesWritten = 0;
  let hazardsWritten = 0;
  for (const h of imported.holes) {
    await prisma.courseHole.upsert({
      where: { courseId_hole: { courseId: course.id, hole: h.number } },
      update: {
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
      create: {
        courseId: course.id,
        hole: h.number,
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
    });
    holesWritten++;
    for (const hz of h.hazards) {
      await prisma.courseHazard.create({
        data: {
          courseId: course.id,
          hole: h.number,
          kind: hz.kind,
          label: hz.label ?? null,
          lat: hz.lat,
          lng: hz.lng,
          // Bulk import has no signed-in user. Marker rather than null
          // would be ideal -- v1 leaves contributedById nullable so we
          // can pass null without violating schema.
          contributedById: null,
        },
      });
      hazardsWritten++;
    }
  }
  return { holes: holesWritten, hazards: hazardsWritten };
}

async function main() {
  const flags = parseCli();
  const report = loadReport();

  let matches = report.filter(
    (e): e is MatchedEntry => e.kind === "matched",
  );
  if (flags.ids.length > 0) {
    const idSet = new Set(flags.ids);
    matches = matches.filter((m) => idSet.has(m.presetId));
  }
  if (flags.limit != null) matches = matches.slice(0, flags.limit);

  console.log(`Processing ${matches.length} matched courses...`);
  if (flags.dryRun) console.log("(dry-run: no DB writes)");
  if (flags.force) console.log("(--force: re-importing even if already imported)");

  // presetId -> preset object lookup
  const presetById = new Map(COURSE_PRESETS.map((p) => [p.id, p]));

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let i = 0;
  for (const m of matches) {
    i++;
    const preset = presetById.get(m.presetId);
    if (!preset) {
      console.log(
        `[${i}/${matches.length}] missing preset (catalog drift?) ${m.presetId}`,
      );
      failed++;
      continue;
    }

    if (!flags.force && (await alreadyImported(preset.name))) {
      console.log(`[${i}/${matches.length}] already imported, skipping ${preset.id}`);
      skipped++;
      continue;
    }

    try {
      const counts = await importOne(m, preset, flags.dryRun);
      console.log(
        `[${i}/${matches.length}] ${flags.dryRun ? "would-import" : "imported"} ${preset.id}: ${counts.holes} holes, ${counts.hazards} hazards`,
      );
      imported++;
    } catch (err) {
      console.log(
        `[${i}/${matches.length}] FAILED ${preset.id}: ${(err as Error).message}`,
      );
      failed++;
    }

    // Polite delay between courses. Golfbert payloads are ~50KB and
    // each course is ~38 API calls (1 + 18 polygons + 18 teeboxes).
    // At 250ms between courses we run ~14k req/hour, well under any
    // reasonable rate limit.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("\n--- Summary ---");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Failed:   ${failed}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
