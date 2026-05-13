"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { selectGroupAction } from "@/lib/actions";

export type GroupOption = { id: string; name: string };

export default function GroupSwitcher({
  groups,
  active,
}: {
  groups: GroupOption[];
  active: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    const fd = new FormData();
    fd.set("groupId", value);
    startTransition(async () => {
      await selectGroupAction(fd);
      router.refresh();
    });
  };

  return (
    <select
      aria-label="Group filter"
      className="input h-9 py-0 px-2 text-xs max-w-[10rem] sm:max-w-[14rem] truncate"
      value={active}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
    >
      <option value="">All my groups</option>
      <option value="public">Public only</option>
      {groups.length > 0 && (
        <optgroup label="My groups">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
