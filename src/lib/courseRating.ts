// Course Rating + Slope estimation from tee yardage.
//
// A real USGA rating is measured on-site (effective playing length +
// obstacle factors). We don't have that for most courses, but we DO
// have tee yardages from the Golfbert import -- and rating/slope are
// overwhelmingly driven by length. So we estimate:
//
//   Course Rating ~ the score a scratch golfer is expected to shoot.
//     Anchored at ~90 yards of length per stroke of par (a par-72 at
//     ~6,480 yds rates about even), then +1 rating stroke per ~220
//     extra yards (the USGA scratch value).
//
//   Slope ~ how much harder the course plays for a bogey golfer than a
//     scratch. It rises with length; anchored at the USGA-average 113
//     and moving ~6 points per rating-stroke away from par.
//
// These are ESTIMATES -- directionally right and course-fair (a long
// hard track rates higher than a short muni), but not official. Real
// measured values, when entered, always override the estimate. Every
// estimate is flagged `estimated: true` so the UI can be honest about
// which courses carry a true rating.

export type RatingSlope = {
  rating: number; // Course Rating, one decimal
  slope: number; // Slope Rating, integer, clamped to a realistic band
  estimated: boolean;
};

const YARDS_PER_PAR_STROKE = 90; // scratch-length baseline
const YARDS_PER_RATING_STROKE = 220; // USGA scratch value
const SLOPE_PER_RATING_STROKE = 6;
const SLOPE_BASE = 113; // USGA average
// USGA bounds are 55-155; real courses cluster far tighter, so we clamp
// to a band that keeps a bad yardage read from producing an absurd slope.
const SLOPE_MIN = 95;
const SLOPE_MAX = 150;

/**
 * Estimate Course Rating + Slope for a set of tees from its total
 * yardage and par. Returns null when inputs are unusable (missing or
 * implausible yardage) so callers fall back to the score-only model.
 */
export function estimateRatingSlope(
  yardage: number | null | undefined,
  par: number,
): RatingSlope | null {
  if (yardage == null || !Number.isFinite(yardage) || yardage < 1000) {
    return null;
  }
  const baselineYards = par * YARDS_PER_PAR_STROKE;
  const rating =
    Math.round(
      (par + (yardage - baselineYards) / YARDS_PER_RATING_STROKE) * 10,
    ) / 10;
  const rawSlope =
    SLOPE_BASE + (rating - par) * SLOPE_PER_RATING_STROKE;
  const slope = Math.max(SLOPE_MIN, Math.min(SLOPE_MAX, Math.round(rawSlope)));
  return { rating, slope, estimated: true };
}

/**
 * WHS Score Differential for an 18-hole round:
 *   (113 / Slope) * (Adjusted Gross Score - Course Rating)
 * We use raw gross as the AGS for now (net-double-bogey capping is a
 * future refinement). Returns the differential to one decimal.
 */
export function scoreDifferential(
  gross: number,
  rating: number,
  slope: number,
): number {
  return Math.round(((113 / slope) * (gross - rating)) * 10) / 10;
}
