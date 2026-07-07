// Course tee sets for the round-creation tee picker, and resolving a
// chosen tee to the rating/slope snapshot stored on a MatchPlayer.
//
// Tees come from CourseTee (populated by the hand-gathered rating
// importer and, for the long tail, the yardage estimate-seed). When a
// course has no CourseTee rows yet, we synthesize a single "Default"
// option from the Course row's default rating/slope (which may itself
// be an estimate) so the picker always offers something.

import { prisma } from "./db";

export type TeeOption = {
  name: string;
  rating: number;
  slope: number;
  yardage: number | null;
  estimated: boolean;
};

export type CourseTeeSet = {
  courseName: string;
  tees: TeeOption[];
  // Name of the tee to preselect (the Course default, else the first).
  defaultTeeName: string | null;
};

/** All selectable tees for a course, longest first, plus the default. */
export async function getCourseTeeSet(
  courseName: string,
): Promise<CourseTeeSet> {
  const course = await prisma.course.findUnique({
    where: { name: courseName },
    select: {
      rating: true,
      slope: true,
      yardage: true,
      ratingEstimated: true,
      tees: {
        select: {
          name: true,
          rating: true,
          slope: true,
          yardage: true,
          estimated: true,
        },
      },
    },
  });
  if (!course) return { courseName, tees: [], defaultTeeName: null };

  let tees: TeeOption[] = course.tees.map((t) => ({
    name: t.name,
    rating: t.rating,
    slope: t.slope,
    yardage: t.yardage,
    estimated: t.estimated,
  }));

  // No per-tee rows yet: synthesize one from the course default so the
  // picker isn't empty.
  if (tees.length === 0 && course.rating != null && course.slope != null) {
    tees = [
      {
        name: "Default",
        rating: course.rating,
        slope: course.slope,
        yardage: course.yardage,
        estimated: course.ratingEstimated,
      },
    ];
  }

  // Longest (hardest) first -- reads like a scorecard, tips at the top.
  tees.sort((a, b) => (b.yardage ?? b.rating) - (a.yardage ?? a.rating));

  // Default: the tee matching the course's stored default rating, else
  // a regular/middle-named set, else the first.
  const byRating = tees.find(
    (t) => course.rating != null && Math.abs(t.rating - course.rating) < 0.05,
  );
  const named = tees.find((t) =>
    /\b(regular|white|middle|club|member|blue)\b/i.test(t.name),
  );
  const defaultTeeName = (byRating ?? named ?? tees[0])?.name ?? null;

  return { courseName, tees, defaultTeeName };
}

export type TeeSnapshot = {
  teeName: string;
  courseRating: number;
  slope: number;
};

/**
 * Resolve a chosen tee name to the rating/slope snapshot to store on a
 * MatchPlayer at round-creation time. Null when the course has no
 * rating data at all (the handicap calc then falls back to the
 * score-only model for that round).
 */
export async function resolveTeeSnapshot(
  courseName: string,
  teeName: string | null,
): Promise<TeeSnapshot | null> {
  const { tees, defaultTeeName } = await getCourseTeeSet(courseName);
  if (tees.length === 0) return null;
  const wanted = teeName ?? defaultTeeName;
  const tee =
    tees.find((t) => t.name.toLowerCase() === (wanted ?? "").toLowerCase()) ??
    tees.find((t) => t.name === defaultTeeName) ??
    tees[0];
  return { teeName: tee.name, courseRating: tee.rating, slope: tee.slope };
}
