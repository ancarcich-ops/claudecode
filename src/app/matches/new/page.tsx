import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMatchAction } from "@/lib/actions";
import { COURSE_PRESETS } from "@/lib/courses";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import NewMatchForm from "./NewMatchForm";

export const dynamic = "force-dynamic";

export default async function NewMatchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const recent = await prisma.match.findMany({
    where: { createdById: user.id },
    select: { courseName: true, scheduledAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const recentCourses = Array.from(
    new Set(recent.map((r) => r.courseName)),
  ).slice(0, 12);

  const defaultName =
    user.displayName ??
    user.username.charAt(0).toUpperCase() + user.username.slice(1);

  const groups = await listUserGroups(user.id);
  const activeGroup = getActiveGroupId();
  // Default the form to the user's currently-selected group if it's a real
  // group they belong to; otherwise "public".
  const defaultGroupId =
    activeGroup && activeGroup !== "public" &&
    groups.some((g) => g.id === activeGroup)
      ? activeGroup
      : "public";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Open the line.
      </h1>
      <p className="text-sm text-mute mb-6">
        Course, tee time, players. Odds move the second you publish.
      </p>
      <NewMatchForm
        action={createMatchAction}
        defaultPlayerName={defaultName}
        currentUserId={user.id}
        recentCourses={recentCourses}
        presets={COURSE_PRESETS}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={defaultGroupId}
      />
    </div>
  );
}
