// Import hand-gathered Course Rating + Slope from a CSV into Course +
// CourseTee, flagged as REAL (estimated=false) so these values win over
// yardage estimates and the estimate-seed never overwrites them.
//
// CSV columns (header row required; extra columns ignored):
//   name,city,region,holes,tee_name,rating,slope,yardage,notes
// One row per tee. A course spans multiple consecutive rows sharing a
// name. Rows missing rating OR slope are skipped (can't form a
// differential); yardage is optional.
//
// For each course the importer:
//   - upserts a Course row by name (creates a bare one if the course
//     has no geo yet -- rating attaches to the name either way)
//   - upserts one CourseTee per valid tee (estimated=false)
//   - picks a default tee (a regular/middle set when named, else the
//     median by rating) and writes Course.rating/slope/yardage from it,
//     ratingEstimated=false
//
// Usage:
//   DATABASE_URL=postgres://... npx tsx scripts/import-course-ratings.ts <file.csv> [--dry-run]
//
// --dry-run parses + validates + prints the plan, touching no DB.

import { readFileSync } from "fs";

type Row = {
  name: string;
  holes: number | null;
  teeName: string;
  gender: string; // "M" | "W" -- part of the tee identity (ratings differ)
  rating: number | null;
  slope: number | null;
  yardage: number | null;
};

// Minimal RFC-4180-ish CSV parser: handles quoted fields with commas
// and doubled quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const DEFAULT_TEE = /\b(regular|white|middle|club|member|blue)\b/i;

// The course's default tee (used when a round carries no per-player tee
// snapshot) is a men's regular/middle set -- we don't track player
// gender, so men's is the neutral default.
function pickDefault(tees: Row[]): Row {
  const mens = tees.filter((t) => t.gender === "M");
  const pool = mens.length ? mens : tees;
  const named = pool.find((t) => DEFAULT_TEE.test(t.teeName));
  if (named) return named;
  const sorted = [...pool].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("Usage: tsx scripts/import-course-ratings.ts <file.csv> [--dry-run]");
    process.exit(1);
  }

  const parsed = parseCsv(readFileSync(file, "utf8"));
  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iName = col("name");
  const iHoles = col("holes");
  const iTee = col("tee_name");
  const iGender = col("gender");
  const iRating = col("rating");
  const iSlope = col("slope");
  const iYards = col("yardage");
  if (iName < 0 || iRating < 0 || iSlope < 0) {
    console.error("CSV must have name, rating, slope columns");
    process.exit(1);
  }

  // Group data rows by course name (order preserved).
  const byCourse = new Map<string, Row[]>();
  let skippedNoRating = 0;
  for (const r of parsed.slice(1)) {
    const name = (r[iName] ?? "").trim();
    if (!name) continue;
    const rating = num(r[iRating]);
    const slope = num(r[iSlope]);
    const genderRaw = (iGender >= 0 ? r[iGender] ?? "" : "").trim().toUpperCase();
    const row: Row = {
      name,
      holes: iHoles >= 0 ? num(r[iHoles]) : null,
      teeName: (r[iTee] ?? "").trim() || "Default",
      // "F" and "L"(adies) normalize to "W"; anything else defaults to men's.
      gender: genderRaw === "W" || genderRaw === "F" || genderRaw === "L" ? "W" : "M",
      rating,
      slope,
      yardage: iYards >= 0 ? num(r[iYards]) : null,
    };
    if (rating == null || slope == null) {
      skippedNoRating++;
      continue; // can't form a differential
    }
    const list = byCourse.get(name) ?? [];
    list.push(row);
    byCourse.set(name, list);
  }

  let courseCount = 0;
  let teeCount = 0;
  const plan: string[] = [];
  for (const [name, tees] of byCourse) {
    if (tees.length === 0) continue;
    courseCount++;
    teeCount += tees.length;
    const def = pickDefault(tees);
    plan.push(
      `${name}  [default: ${def.teeName} ${def.rating}/${def.slope}${def.yardage ? ` ${def.yardage}y` : ""}]`,
    );
    for (const t of tees) {
      plan.push(
        `    · ${t.teeName.padEnd(14)} ${t.gender} ${String(t.rating).padStart(5)} / ${String(t.slope).padStart(3)}${t.yardage ? ` / ${t.yardage}y` : ""}`,
      );
    }
  }

  console.log(plan.join("\n"));
  console.log(
    `\n${courseCount} courses · ${teeCount} tees · ${skippedNoRating} rows skipped (missing rating/slope)`,
  );

  if (dryRun) {
    console.log("\n[dry-run] no database writes.");
    return;
  }

  // Live import.
  const { prisma } = await import("../src/lib/db");
  let wrote = 0;
  for (const [name, tees] of byCourse) {
    const course = await prisma.course.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    for (const t of tees) {
      await prisma.courseTee.upsert({
        where: {
          courseId_name_gender: {
            courseId: course.id,
            name: t.teeName,
            gender: t.gender,
          },
        },
        update: {
          rating: t.rating!,
          slope: Math.round(t.slope!),
          yardage: t.yardage ?? null,
          estimated: false,
        },
        create: {
          courseId: course.id,
          name: t.teeName,
          gender: t.gender,
          rating: t.rating!,
          slope: Math.round(t.slope!),
          yardage: t.yardage ?? null,
          estimated: false,
        },
      });
    }
    const def = pickDefault(tees);
    await prisma.course.update({
      where: { id: course.id },
      data: {
        rating: def.rating!,
        slope: Math.round(def.slope!),
        yardage: def.yardage ?? null,
        ratingEstimated: false,
      },
    });
    wrote++;
  }
  console.log(`\nImported ${wrote} courses.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
