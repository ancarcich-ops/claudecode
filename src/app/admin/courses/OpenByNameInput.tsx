"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Small client form so the admin can jump straight to /admin/courses/X
// for a name that isn't already in the catalog or DB. The editor's
// findOrCreateCourseByName will create the row on first save.
export default function OpenByNameInput() {
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        router.push(`/admin/courses/${encodeURIComponent(trimmed)}`);
      }}
      className="flex items-center gap-2"
    >
      <input
        className="input flex-1 text-sm"
        placeholder="Open course by name — e.g. Chambers Bay"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="btn btn-primary text-xs h-9"
      >
        Open
      </button>
    </form>
  );
}
