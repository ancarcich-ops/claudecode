"use client";

import { useEffect } from "react";

// Fire-and-forget POST to /api/courses/seed for each unmapped course
// visible on the home grid. The endpoint just calls importCourseFromOsm,
// which is idempotent + caches forever, so a no-op re-trigger costs us
// nothing. As soon as one succeeds, the next AutoRefresh tick will see
// real CourseHole rows and the peek panels will swap in real shapes.
export default function CourseSeeder({
  courses,
}: {
  // Course name + hole count for everything we couldn't find geo for.
  courses: { name: string; holes: number }[];
}) {
  useEffect(() => {
    if (courses.length === 0) return;
    let cancelled = false;
    const run = async () => {
      // Stagger the calls so a busy home page doesn't fire 6 Overpass
      // requests in the same tick.
      for (const c of courses) {
        if (cancelled) return;
        try {
          await fetch("/api/courses/seed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(c),
          });
        } catch {
          // ignore; next page load will retry
        }
        // 400ms gap between courses is fine -- this runs in the background.
        await new Promise((r) => setTimeout(r, 400));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [courses]);

  return null;
}
