"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CategoryPicker from "./CategoryPicker";
import IntensityHearts from "./IntensityHearts";
import { addCraving } from "@/lib/actions";
import { celebrate } from "@/lib/confetti";
import type { Who } from "@/lib/identity";

// The full "log a craving" form. Posts to the addCraving server action, then
// fires confetti + a toast and bounces to the cravings list. `photoEnabled`
// hides the file input when no blob store is configured (so we never promise
// uploads that would silently no-op).
export default function CravingForm({
  who,
  momName,
  partnerName,
  photoEnabled,
}: {
  who: Who;
  momName: string;
  partnerName: string;
  photoEnabled: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [wild, setWild] = useState(false);
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
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="loggedBy" value={who} />

      <div>
        <label className="label" htmlFor="food">
          What is she craving?
        </label>
        <input
          id="food"
          name="food"
          autoFocus
          placeholder="Dill pickles, mango with chili, gas station nachos…"
          className="input text-lg"
        />
      </div>

      <div>
        <span className="label">Category</span>
        <CategoryPicker />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="label mb-0">How strong?</span>
        <IntensityHearts />
      </div>

      <div className="flex flex-wrap gap-2">
        <ToggleChip active={wild} onClick={() => setWild((w) => !w)} emoji="✨">
          Wild combo
        </ToggleChip>
        <ToggleChip
          active={satisfied}
          onClick={() => setSatisfied((s) => !s)}
          emoji="✅"
        >
          Already satisfied
        </ToggleChip>
        <input type="hidden" name="isWild" value={wild ? "true" : "false"} />
        <input type="hidden" name="satisfied" value={satisfied ? "true" : "false"} />
      </div>

      {satisfied && (
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
          When? <span className="text-faint normal-case">(leave blank for now)</span>
        </label>
        <input id="cravedAt" name="cravedAt" type="datetime-local" className="input" />
      </div>

      {photoEnabled && (
        <div>
          <label className="label" htmlFor="photo">
            Snap a pic <span className="text-faint normal-case">(optional)</span>
          </label>
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
          placeholder="2am. Cried a little. Worth it."
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full py-3 text-base">
        {pending ? "Saving…" : "Log this craving 🌸"}
      </button>
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
