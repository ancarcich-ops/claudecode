import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createTournamentAction } from "@/lib/actions";
import { listUserGroups, getActiveGroupId } from "@/lib/groups";
import NewTournamentForm from "./NewTournamentForm";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: { group?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groups = await listUserGroups(user.id);
  const activeGroup = getActiveGroupId();
  // Default group is the one passed via ?group=, falling back to the
  // currently-selected sidebar group or "public". Same logic as the
  // new-match page so the UX feels consistent.
  const defaultGroupId = (() => {
    const candidate = searchParams.group ?? activeGroup ?? "public";
    if (candidate === "public") return "public";
    if (groups.some((g) => g.id === candidate)) return candidate;
    return "public";
  })();

  const defaultName =
    user.displayName ??
    user.username.charAt(0).toUpperCase() + user.username.slice(1);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Build the bracket.
      </h1>
      <p className="text-sm text-mute mb-6">
        Multiple rounds, same roster, one cumulative leaderboard.
      </p>
      <NewTournamentForm
        action={createTournamentAction}
        defaultPlayerName={defaultName}
        currentUserId={user.id}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={defaultGroupId}
      />
    </div>
  );
}
