import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMatchAction } from "@/lib/actions";
import { COURSE_PRESETS } from "@/lib/courses";
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Post a round</h1>
      <p className="text-sm text-mute mb-6">
        Tell the market what&apos;s on the tee. Odds open the moment you
        publish.
      </p>
      <NewMatchForm
        action={createMatchAction}
        defaultPlayerName={defaultName}
        recentCourses={recentCourses}
        presets={COURSE_PRESETS}
      />
    </div>
  );
}
