"use client";

import { useTransition } from "react";
import { requestFollowAction, unfollowAction } from "@/lib/actions";
import type { FollowState } from "@/lib/follows";

// Follow control on a profile. One-way + approval-gated:
//   none      -> "Follow"    (sends a request; auto-accepts if they allow)
//   pending   -> "Requested" (tap to cancel the request)
//   accepted  -> "Following" (tap to unfollow)
export default function FollowButton({
  targetUserId,
  state,
}: {
  targetUserId: string;
  state: FollowState;
}) {
  const [pending, start] = useTransition();

  const run = (action: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set("targetUserId", targetUserId);
    start(async () => {
      await action(fd);
    });
  };

  if (state === "none") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(requestFollowAction)}
        className="btn btn-primary text-sm disabled:opacity-60"
      >
        {pending ? "…" : "Follow"}
      </button>
    );
  }

  if (state === "pending") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(unfollowAction)}
        className="btn btn-ghost text-sm disabled:opacity-60"
        title="Request sent — tap to cancel"
      >
        {pending ? "…" : "Requested"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(unfollowAction)}
      className="btn btn-ghost text-sm disabled:opacity-60"
      title="Following — tap to unfollow"
    >
      {pending ? "…" : "Following ✓"}
    </button>
  );
}
