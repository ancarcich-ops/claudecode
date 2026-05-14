import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveGroupCookie } from "@/lib/groups";

export const dynamic = "force-dynamic";

// Heuristic: don't swallow Next.js's internal redirect signal -- it's
// thrown like an error but is the mechanism that drives the navigation.
function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function ErrorCard({
  title,
  detail,
}: {
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md mt-16">
      <div className="card p-6 space-y-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-mute">{detail}</p>
        <Link href="/groups" className="btn btn-ghost">
          Back to groups
        </Link>
      </div>
    </div>
  );
}

export default async function GroupJoinPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const code = (searchParams.code ?? "").trim().toUpperCase();
  if (!code) redirect("/groups");

  // Look up the group. Any DB error here means we can't tell whether the
  // code is valid -- show a helpful message instead of crashing the route.
  let group;
  try {
    group = await prisma.group.findUnique({ where: { inviteCode: code } });
  } catch (err) {
    console.error("[/groups/join] group lookup failed", { code, err });
    return (
      <ErrorCard
        title="Couldn't open this invite"
        detail={
          <>
            We had trouble reaching the database. Try again in a minute. If
            this keeps happening, the host can re-share the link.
          </>
        }
      />
    );
  }

  if (!group) {
    return (
      <ErrorCard
        title="Invite not found"
        detail={
          <>
            The code <code className="chip font-mono">{code}</code> doesn&apos;t
            match any group. Double-check the link.
          </>
        }
      />
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/groups/join?code=${code}`)}`);
  }

  try {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
      update: {},
      create: { groupId: group.id, userId: user.id },
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("[/groups/join] member upsert failed", {
      code,
      groupId: group.id,
      userId: user.id,
      err,
    });
    return (
      <ErrorCard
        title="Couldn't add you to the group"
        detail={
          <>
            Something went wrong saving your membership. Try clicking the link
            again. If it keeps failing, ask the host to re-share.
          </>
        }
      />
    );
  }

  setActiveGroupCookie(group.id);
  redirect("/groups");
}
