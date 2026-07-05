// GET  /api/mobile/groups -- the caller's groups for the iOS Groups
//      screen: identity + counts + invite code + a few member names
//      for the avatar stack.
// POST /api/mobile/groups -- create a group. Body: { "name": "..." }.
//      Mirrors the web's createGroupAction (invite-code/slug collision
//      retry, creator seated as owner).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import {
  listUserGroups,
  generateInviteCode,
  slugifyGroupName,
  uniqueGroupSlug,
} from "@/lib/groups";

export const dynamic = "force-dynamic";

function shapeGroup(g: Awaited<ReturnType<typeof listUserGroups>>[number]) {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    inviteCode: g.inviteCode,
    memberCount: g._count.members,
    matchCount: g._count.matches,
    memberNames: g.members.map((m) => m.user.displayName || m.user.username),
    createdAt: g.createdAt,
  };
}

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  const groups = await listUserGroups(user.id);
  return NextResponse.json({ groups: groups.map(shapeGroup) });
}

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let name = "";
  try {
    const body = await req.json();
    name = String(body?.name ?? "").trim();
  } catch {}
  if (!name) {
    return NextResponse.json({ error: "Group name required" }, { status: 400 });
  }
  if (name.length > 40) {
    return NextResponse.json({ error: "Group name too long" }, { status: 400 });
  }

  // Same collision-retry as the web's createGroupAction.
  const slugBase = slugifyGroupName(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const slug = await uniqueGroupSlug(slugBase);
    try {
      const group = await prisma.group.create({
        data: {
          name,
          slug,
          inviteCode: code,
          createdById: user.id,
          members: { create: { userId: user.id, role: "owner" } },
        },
        include: {
          _count: { select: { members: true, matches: true } },
          members: {
            orderBy: { joinedAt: "asc" },
            take: 4,
            select: {
              user: { select: { displayName: true, username: true } },
            },
          },
        },
      });
      return NextResponse.json({ group: shapeGroup(group) });
    } catch {
      // unique-constraint retry (invite code or slug race)
    }
  }
  return NextResponse.json(
    { error: "Could not create group. Try again." },
    { status: 500 },
  );
}
