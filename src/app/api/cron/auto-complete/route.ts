// Daily cron backstop for auto-completing abandoned rounds (the lazy
// sweeps on the home feed / match page do the timely closing; this
// catches matches nobody revisits). Wired in vercel.json.
//
// When CRON_SECRET is set, Vercel sends it as a Bearer token and we
// require it; without it (local dev) the route is open but harmless.

import { NextResponse } from "next/server";
import { autoCompleteStaleMatches } from "@/lib/autoComplete";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const closed = await autoCompleteStaleMatches();
  if (closed > 0) revalidatePath("/");
  return NextResponse.json({ closed });
}
