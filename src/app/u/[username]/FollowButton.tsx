"use client";

import { useEffect, useState, useTransition } from "react";
import { requestFollowAction, unfollowAction } from "@/lib/actions";
import type { FollowState } from "@/lib/follows";

// Follow control (used on profiles and in people-search results).
// One-way + approval-gated:
//   none      -> "Follow"    (sends a request; auto-accepts if they allow)
//   pending   -> "Requested" (tap to cancel the request)
//   accepted  -> "Following" (tap to unfollow)
// Updates optimistically so it reflects the tap immediately even in a
// client-rendered list that the server can't revalidate in place.
export default function FollowButton({
  targetUserId,
  state,
  size = "sm",
}: {
  targetUserId: string;
  state: FollowState;
  size?: "sm" | "xs";
}) {
  const [current, setCurrent] = useState<FollowState>(state);
  const [pending, start] = useTransition();

  // Sync when the server hands down a new state (e.g. after revalidation).
  useEffect(() => setCurrent(state), [state]);

  const act = (
    action: (fd: FormData) => Promise<void>,
    optimistic: FollowState,
  ) => {
    const prev = current;
    setCurrent(optimistic);
    const fd = new FormData();
    fd.set("targetUserId", targetUserId);
    start(async () => {
      try {
        await action(fd);
      } catch {
        setCurrent(prev);
      }
    });
  };

  const cls =
    (current === "none" ? "btn btn-primary" : "btn btn-ghost") +
    (size === "xs" ? " text-xs" : " text-sm") +
    " disabled:opacity-60 shrink-0";

  if (current === "none") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => act(requestFollowAction, "pending")}
        className={cls}
      >
        Follow
      </button>
    );
  }
  if (current === "pending") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => act(unfollowAction, "none")}
        className={cls}
        title="Request sent — tap to cancel"
      >
        Requested
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => act(unfollowAction, "none")}
      className={cls}
      title="Following — tap to unfollow"
    >
      Following ✓
    </button>
  );
}
