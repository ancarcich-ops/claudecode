import { NextResponse } from "next/server";
import { getMatchVersion } from "@/lib/match";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const version = await getMatchVersion(params.id);
  return NextResponse.json({ version });
}
