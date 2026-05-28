"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSettings } from "@/lib/actions";

export default function SettingsForm({
  dueDate,
  momName,
  partnerName,
  babyName,
}: {
  dueDate: string; // yyyy-mm-dd or ""
  momName: string;
  partnerName: string;
  babyName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateSettings(fd);
      toast.success("Saved 🌸");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="dueDate">
          Due date
        </label>
        <input id="dueDate" name="dueDate" type="date" defaultValue={dueDate} className="input" />
        <p className="mt-1 text-xs text-faint">
          Powers the week count, trimester, and &quot;size of a fruit&quot; tracker.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="momName">
            Mom&apos;s name
          </label>
          <input id="momName" name="momName" defaultValue={momName} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="partnerName">
            Partner&apos;s name
          </label>
          <input id="partnerName" name="partnerName" defaultValue={partnerName} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="babyName">
          Baby&apos;s name / nickname <span className="text-faint normal-case">(optional)</span>
        </label>
        <input id="babyName" name="babyName" defaultValue={babyName} placeholder="Baby girl 💕" className="input" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
