import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUserGroups } from "@/lib/groups";
import {
  createGroupAction,
  joinGroupAction,
  leaveGroupAction,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groups = await listUserGroups(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Groups</h1>
        <p className="text-sm text-mute">
          A group is a private feed. Matches you post to a group are only
          visible to other members. Share an invite code to add friends.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Your groups
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-mute">
            You haven&apos;t joined any groups yet. Create one below, or join
            with an invite code.
          </p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  <div className="text-xs text-mute">
                    {g._count.members} member{g._count.members === 1 ? "" : "s"}{" "}
                    · {g._count.matches} match
                    {g._count.matches === 1 ? "" : "es"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <code className="chip font-mono text-xs">
                    {g.inviteCode}
                  </code>
                  <form action={leaveGroupAction}>
                    <input type="hidden" name="groupId" value={g.id} />
                    <button
                      type="submit"
                      className="btn btn-ghost text-xs"
                      title="Leave this group"
                    >
                      Leave
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Create a group
        </h2>
        <form action={createGroupAction} className="flex gap-2">
          <input
            name="name"
            className="input flex-1 min-w-0"
            placeholder="Saturday foursome, College buddies, ..."
            maxLength={40}
            required
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Create
          </button>
        </form>
        <p className="text-xs text-mute mt-2">
          You&apos;ll get an invite code to share. Anyone with the code can
          join.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Join with an invite code
        </h2>
        <form action={joinGroupAction} className="flex gap-2">
          <input
            name="inviteCode"
            className="input flex-1 min-w-0 font-mono uppercase tracking-widest"
            placeholder="ABC123"
            maxLength={12}
            required
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Join
          </button>
        </form>
      </section>
    </div>
  );
}
