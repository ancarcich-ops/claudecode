import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveGroupCookie } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default async function GroupJoinPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const code = (searchParams.code ?? "").trim().toUpperCase();
  if (!code) redirect("/groups");

  const group = await prisma.group.findUnique({ where: { inviteCode: code } });

  if (!group) {
    return (
      <div className="mx-auto max-w-md mt-16">
        <div className="card p-6 space-y-3">
          <h1 className="text-lg font-semibold">Invite not found</h1>
          <p className="text-sm text-mute">
            The code <code className="chip font-mono">{code}</code> doesn&apos;t
            match any group. Double-check the link.
          </p>
          <Link href="/groups" className="btn btn-ghost">
            Back to groups
          </Link>
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    // Send to login carrying the invite code so we land back here after sign-in.
    redirect(`/login?next=${encodeURIComponent(`/groups/join?code=${code}`)}`);
  }

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    update: {},
    create: { groupId: group.id, userId: user.id },
  });

  setActiveGroupCookie(group.id);
  redirect("/groups");
}
