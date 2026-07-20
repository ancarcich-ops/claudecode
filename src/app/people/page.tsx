import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PlayerAvatar, { isVariant, type AvatarVariant } from "@/components/Avatar";
import {
  listPendingRequests,
  listFollowers,
  listFollowing,
  type FollowUser,
} from "@/lib/follows";
import PeopleActions from "./PeopleActions";
import PeopleSearch from "./PeopleSearch";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People · Sticks",
};

export default async function PeoplePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const [requests, followers, following] = await Promise.all([
    listPendingRequests(me.id),
    listFollowers(me.id),
    listFollowing(me.id),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          People
        </h1>
        <p className="text-sm text-mute mt-1">
          Follow players to see their rounds in your home feed. Following is
          one-way and approved by the person you follow.
        </p>
      </div>

      <PeopleSearch />

      <Section
        title="Requests"
        count={requests.length}
        empty="No pending follow requests."
      >
        {requests.map((r) => (
          <PersonRow key={r.user.id} user={r.user}>
            <PeopleActions userId={r.user.id} variant="request" />
          </PersonRow>
        ))}
      </Section>

      <Section
        title="Following"
        count={following.length}
        empty="You're not following anyone yet — open a player's profile and tap Follow."
      >
        {following.map((u) => (
          <PersonRow key={u.id} user={u}>
            <PeopleActions userId={u.id} variant="following" />
          </PersonRow>
        ))}
      </Section>

      <Section
        title="Followers"
        count={followers.length}
        empty="No followers yet."
      >
        {followers.map((u) => (
          <PersonRow key={u.id} user={u}>
            <PeopleActions userId={u.id} variant="follower" />
          </PersonRow>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-base font-semibold text-ink">
          {title}
        </h2>
        {count > 0 && (
          <span className="font-mono text-[11px] text-mute">{count}</span>
        )}
      </div>
      {count === 0 ? (
        <p className="text-sm text-mute">{empty}</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </section>
  );
}

function PersonRow({
  user,
  children,
}: {
  user: FollowUser;
  children: React.ReactNode;
}) {
  const name = user.displayName ?? user.username;
  const variant: AvatarVariant =
    user.avatarVariant && isVariant(user.avatarVariant)
      ? (user.avatarVariant as AvatarVariant)
      : "beam";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
      <Link href={`/u/${user.username}`} className="shrink-0">
        <span className="inline-block h-9 w-9 rounded-full overflow-hidden">
          <PlayerAvatar
            seed={user.avatarSeed ?? user.username}
            variant={variant}
            avatarUrl={user.avatarUrl ?? null}
            size={36}
          />
        </span>
      </Link>
      <Link href={`/u/${user.username}`} className="min-w-0 flex-1">
        <div className="font-medium text-ink truncate">{name}</div>
        <div className="text-[12px] text-mute truncate">@{user.username}</div>
      </Link>
      {children}
    </div>
  );
}
