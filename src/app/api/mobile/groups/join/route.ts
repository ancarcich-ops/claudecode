// POST /api/mobile/groups/join -- join a group by invite code.
// Body: { "code": "ABC123" }. Idempotent: already a member = success.
// Mirrors the web's joinGroupAction.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code ?? "").trim().toUpperCase();
  } catch {}
  if (!code) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const group = await prisma.group.findUnique({
    where: { inviteCode: code },
    include: {
      _count: { select: { members: true, matches: true } },
      members: {
        orderBy: { joinedAt: "asc" },
        take: 4,
        select: { user: { select: { displayName: true, username: true } } },
      },
    },
  });
  if (!group) {
    return NextResponse.json(
      { error: `Code ${code} doesn't match any group. Double-check it.` },
      { status: 404 },
    );
  }

  const wasMember = !!(await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    select: { id: true },
  }));
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    update: {},
    create: { groupId: group.id, userId: user.id },
  });

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      slug: group.slug,
      inviteCode: group.inviteCode,
      memberCount: wasMember
        ? group._count.members
        : group._count.members + 1,
      matchCount: group._count.matches,
      memberNames: group.members.map(
        (m) => m.user.displayName || m.user.username,
      ),
      createdAt: group.createdAt,
    },
  });
}
