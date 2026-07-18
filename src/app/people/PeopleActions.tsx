"use client";

import { useTransition } from "react";
import {
  acceptFollowAction,
  declineFollowAction,
  unfollowAction,
} from "@/lib/actions";

// Action buttons for a person row on /people.
//   request   -> Accept / Decline an incoming follow request
//   follower  -> Remove an existing follower
//   following -> Unfollow someone I follow
export default function PeopleActions({
  userId,
  variant,
}: {
  userId: string;
  variant: "request" | "follower" | "following";
}) {
  const [pending, start] = useTransition();

  const run = (
    action: (fd: FormData) => Promise<void>,
    field: "followerId" | "targetUserId",
  ) => {
    const fd = new FormData();
    fd.set(field, userId);
    start(async () => {
      await action(fd);
    });
  };

  if (variant === "request") {
    return (
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(acceptFollowAction, "followerId")}
          className="btn btn-primary text-xs disabled:opacity-60"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(declineFollowAction, "followerId")}
          className="btn btn-ghost text-xs disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    );
  }

  if (variant === "follower") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(declineFollowAction, "followerId")}
        className="btn btn-ghost text-xs shrink-0 disabled:opacity-60"
      >
        Remove
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(unfollowAction, "targetUserId")}
      className="btn btn-ghost text-xs shrink-0 disabled:opacity-60"
    >
      Unfollow
    </button>
  );
}
