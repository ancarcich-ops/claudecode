import { NextResponse } from "next/server";
import { getMarketsVersion } from "@/lib/match";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = await getMarketsVersion();
  return NextResponse.json({ version });
}
