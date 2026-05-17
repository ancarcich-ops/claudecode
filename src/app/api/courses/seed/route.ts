import { NextResponse, type NextRequest } from "next/server";
import { importCourseFromOsm } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Background hook used by the home grid to lazily seed OpenStreetMap
// geometry for courses we don't have data for yet. importCourseFromOsm
// is idempotent (returns immediately if the course is already populated),
// so calling this often is cheap.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { name?: string; holes?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const holes = Number(body.holes ?? 18);
  if (!name) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await importCourseFromOsm(name, holes);
  } catch {
    // Nominatim / Overpass occasionally hiccup; swallow so the client
    // can just retry on the next page load.
  }
  return NextResponse.json({ ok: true });
}
