"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Craving } from "@prisma/client";
import { toast } from "sonner";
import CategoryPicker from "./CategoryPicker";
import IntensityHearts from "./IntensityHearts";
import { addCraving, updateCraving } from "@/lib/actions";
import { celebrate } from "@/lib/confetti";
import type { Who } from "@/lib/identity";
import type { CategoryKey } from "@/lib/categories";

// Format a Date into the value a <input type="datetime-local"> expects,
// in the browser's local time.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Shared craving form. In "create" mode it posts to addCraving (confetti +
// bounce to the list); in "edit" mode it pre-fills from `craving`, posts to
// updateCraving, and returns to where you came from. The "already satisfied"
// toggle only shows on create — fulfillment is managed on the card itself.
export default function CravingForm({
  who,
  momName,
  partnerName,
  photoEnabled,
  mode = "create",
  craving,
}: {
  who: Who;
  momName: string;
  partnerName: string;
  photoEnabled: boolean;
  mode?: "create" | "edit";
  craving?: Craving;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [wild, setWild] = useState(craving?.isWild ?? false);
  const [satisfied, setSatisfied] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("food") || "").trim()) {
      toast.error("What's the craving? Give it a name 🍴");
      return;
    }
    startTransition(async () => {
      if (isEdit && craving) {
        await updateCraving(craving.id, fd);
        toast.success("Updated 🌸");
        router.back();
        return;
      }
      await addCraving(fd);
      await celebrate(wild ? 1.4 : 1);
      toast.success(wild ? "Logged a wild one! ✨" : "Craving logged 🌸");
      form.reset();
      setWild(false);
      setSatisfied(false);
      setPreview(null);
      router.push("/cravings");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="loggedBy" value={who} />

      <div>
        <label className="label" htmlFor="food">
          What is she craving?
        </label>
        <input
          id="food"
          name="food"
          autoFocus={!isEdit}
          defaultValue={craving?.food ?? ""}
          placeholder="Dill pickles, mango with chili, gas station nachos…"
          className="input text-lg"
        />
      </div>

      <div>
        <span className="label">Category</span>
        <CategoryPicker defaultValue={(craving?.category as CategoryKey) ?? "other"} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="label mb-0">How strong?</span>
        <IntensityHearts defaultValue={craving?.intensity ?? 3} />
      </div>

      <div className="flex flex-wrap gap-2">
        <ToggleChip active={wild} onClick={() => setWild((w) => !w)} emoji="✨">
          Wild combo
        </ToggleChip>
        {!isEdit && (
          <ToggleChip
            active={satisfied}
            onClick={() => setSatisfied((s) => !s)}
            emoji="✅"
          >
            Already satisfied
          </ToggleChip>
        )}
        <input type="hidden" name="isWild" value={wild ? "true" : "false"} />
        {!isEdit && (
          <input type="hidden" name="satisfied" value={satisfied ? "true" : "false"} />
        )}
      </div>

      {!isEdit && satisfied && (
        <div className="rise">
          <label className="label" htmlFor="satisfiedBy">
            Who came through?
          </label>
          <select id="satisfiedBy" name="satisfiedBy" className="input" defaultValue="daddy">
            <option value="daddy">{partnerName}</option>
            <option value="geena">{momName}</option>
            <option value="takeout">Takeout / delivery</option>
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="cravedAt">
          When?{" "}
          {!isEdit && <span className="text-faint normal-case">(leave blank for now)</span>}
        </label>
        <input
          id="cravedAt"
          name="cravedAt"
          type="datetime-local"
          defaultValue={craving ? toLocalInput(new Date(craving.cravedAt)) : undefined}
          className="input"
        />
      </div>

      {photoEnabled && (
        <div>
          <label className="label" htmlFor="photo">
            {isEdit ? "Replace photo" : "Snap a pic"}{" "}
            <span className="text-faint normal-case">(optional)</span>
          </label>
          {isEdit && craving?.photoUrl && !preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={craving.photoUrl}
              alt={craving.food}
              className="mb-2 h-32 w-full rounded-2xl object-cover"
            />
          )}
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/*"
            className="input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="preview"
              className="mt-2 h-32 w-full rounded-2xl object-cover"
            />
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">
          Notes <span className="text-faint normal-case">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={craving?.notes ?? ""}
          placeholder="2am. Cried a little. Worth it."
          className="input"
        />
      </div>

      <div className="flex gap-2">
        {isEdit && (
          <button
            type="button"
            onClick={() => router.back()}
            className="btn btn-ghost flex-1 py-3 text-base"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary flex-1 py-3 text-base"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Log this craving 🌸"}
        </button>
      </div>
    </form>
  );
}

function ToggleChip({
  active,
  onClick,
  emoji,
  children,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-accent bg-accent/15 text-ink"
          : "border-border bg-panel2 text-mute"
      }`}
    >
      <span>{emoji}</span>
      {children}
    </button>
  );
}
