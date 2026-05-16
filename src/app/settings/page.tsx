import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeUserStats } from "@/lib/userStats";
import AvatarEditor from "./AvatarEditor";
import HandicapCard from "./HandicapCard";
import ReplayOnboarding from "./ReplayOnboarding";
import ThemeToggle from "./ThemeToggle";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect("/login");
  // Fresh read so the editor sees the latest avatar fields after a save.
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarSeed: true,
      avatarVariant: true,
      avatarUrl: true,
      ghinNumber: true,
    },
  });
  if (!user) redirect("/login");

  const photoUploadConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;
  // Computed handicap powered by the user's logged rounds. Same source the
  // /stats page uses.
  const stats = await computeUserStats(user.id);
  const handicap = stats?.handicap ?? null;
  const totalRounds = stats?.rounds.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-mute mt-1">
          @{user.username}
          {user.displayName ? ` · ${user.displayName}` : ""}
        </p>
      </div>

      <AvatarEditor
        userId={user.id}
        username={user.username}
        avatarSeed={user.avatarSeed}
        avatarVariant={user.avatarVariant}
        avatarUrl={user.avatarUrl}
        photoUploadEnabled={photoUploadConfigured}
      />

      <HandicapCard
        currentGhin={user.ghinNumber}
        computedIndex={handicap?.index ?? null}
        fromRounds={handicap?.fromRounds ?? 0}
        totalRounds={totalRounds}
      />

      <ThemeToggle />

      <div className="flex justify-center pt-2">
        <ReplayOnboarding />
      </div>
    </div>
  );
}
