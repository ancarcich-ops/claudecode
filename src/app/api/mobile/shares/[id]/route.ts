// DELETE /api/mobile/shares/:id -- stop (delete) a share link you
// created. Only the share's creator can. 200: { "ok": true }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const share = await prisma.roundShare.findUnique({
    where: { id: params.id },
    select: { id: true, createdById: true },
  });
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  if (share.createdById !== user.id) {
    return NextResponse.json(
      { error: "Not your share link." },
      { status: 403 },
    );
  }
  await prisma.roundShare.delete({ where: { id: share.id } });
  return NextResponse.json({ ok: true });
}
