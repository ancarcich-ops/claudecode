import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveGroupCookie } from "@/lib/groups";

// /groups/join?code=XXX is implemented as a Route Handler (not a Server
// Component) because Next.js only allows cookies().set() inside Route
// Handlers and Server Actions. Doing it from a page render throws the
// "Cookies can only be modified in a Server Action or Route Handler" error.

export const dynamic = "force-dynamic";

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/groups", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "")
    .trim()
    .toUpperCase();

  if (!code) {
    return NextResponse.redirect(new URL("/groups", req.nextUrl.origin));
  }

  let group;
  try {
    group = await prisma.group.findUnique({ where: { inviteCode: code } });
  } catch (err) {
    console.error("[/groups/join] group lookup failed", { code, err });
    return back(req, { error: "db" });
  }

  if (!group) {
    return back(req, { error: "invalid", code });
  }

  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(`/groups/join?code=${code}`);
    return NextResponse.redirect(
      new URL(`/login?next=${next}`, req.nextUrl.origin),
    );
  }

  try {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
      update: {},
      create: { groupId: group.id, userId: user.id },
    });
  } catch (err) {
    console.error("[/groups/join] member upsert failed", {
      code,
      groupId: group.id,
      userId: user.id,
      err,
    });
    return back(req, { error: "join" });
  }

  setActiveGroupCookie(group.id);
  return back(req, { joined: group.id });
}
