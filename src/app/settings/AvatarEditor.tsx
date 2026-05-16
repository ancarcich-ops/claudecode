"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PlayerAvatar, {
  VARIANTS,
  isVariant,
  type AvatarVariant,
} from "@/components/Avatar";
import {
  clearAvatarUrlAction,
  updateAvatarConfigAction,
  uploadAvatarAction,
} from "@/lib/actions";

export default function AvatarEditor({
  userId,
  username,
  avatarSeed,
  avatarVariant,
  avatarUrl,
  photoUploadEnabled,
}: {
  userId: string;
  username: string;
  avatarSeed: string | null;
  avatarVariant: string | null;
  avatarUrl: string | null;
  photoUploadEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local edit state so users can preview before saving.
  const [seed, setSeed] = useState(avatarSeed ?? userId);
  const [variant, setVariant] = useState<AvatarVariant>(
    isVariant(avatarVariant ?? "beam") ? (avatarVariant as AvatarVariant) : "beam",
  );
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Random 8-char seed -- enough entropy to generate distinct avatars.
  const randomize = () => {
    setSeed(Math.random().toString(36).slice(2, 10));
  };

  const saveConfig = () => {
    setErr(null);
    const fd = new FormData();
    fd.set("seed", seed);
    fd.set("variant", variant);
    startTransition(async () => {
      try {
        await updateAvatarConfigAction(fd);
        router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const onUpload = (file: File) => {
    setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        await uploadAvatarAction(fd);
        router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Upload failed");
      }
    });
  };

  const clearPhoto = () => {
    setErr(null);
    startTransition(async () => {
      try {
        await clearAvatarUrlAction();
        router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Clear failed");
      }
    });
  };

  return (
    <section className="card p-5 space-y-5">
      <h2 className="font-display text-base font-semibold text-ink">Avatar</h2>

      {/* Preview */}
      <div className="flex items-center gap-4">
        <PlayerAvatar
          seed={seed}
          variant={variant}
          avatarUrl={avatarUrl}
          size={88}
        />
        <div className="text-sm text-mute">
          {avatarUrl
            ? "Showing your uploaded photo."
            : "Showing a generated avatar. Change the variant or shuffle the seed below."}
        </div>
      </div>

      {/* Photo upload */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-mute">
          Upload a photo
        </div>
        {photoUploadEnabled ? (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="btn btn-primary text-sm"
            >
              {avatarUrl ? "Replace photo" : "Choose photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={clearPhoto}
                disabled={pending}
                className="btn btn-ghost text-xs"
              >
                Remove
              </button>
            )}
            <span className="text-[11px] text-mute">Max 4 MB · jpg / png / webp</span>
          </div>
        ) : (
          <p className="text-[11px] text-mute">
            Photo upload isn&apos;t configured on this deployment. (Admin: set{" "}
            <code className="chip font-mono text-[10px]">BLOB_READ_WRITE_TOKEN</code>{" "}
            in Vercel env vars.) Generated avatars work below.
          </p>
        )}
      </div>

      <hr className="border-border" />

      {/* Generated config */}
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-mute">
          Generated avatar
        </div>
        <div>
          <div className="text-[11px] text-mute mb-2">Style</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {VARIANTS.map((v) => {
              const active = v === variant;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={
                    "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors " +
                    (active
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/30")
                  }
                  aria-pressed={active}
                >
                  <PlayerAvatar seed={seed} variant={v} size={32} />
                  <span className="text-[10px] uppercase tracking-wider text-mute">
                    {v}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-mute" htmlFor="seedInput">
            Seed
          </label>
          <input
            id="seedInput"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="input flex-1"
            maxLength={64}
            placeholder={userId}
          />
          <button
            type="button"
            onClick={randomize}
            className="btn btn-ghost text-xs whitespace-nowrap"
          >
            Shuffle
          </button>
        </div>
        <p className="text-[11px] text-mute">
          Same seed always renders the same avatar. Use anything you like —
          your username, a nickname, a random string.
        </p>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={saveConfig}
            disabled={pending}
            className="btn btn-primary text-sm"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err && (
        <div className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-md px-3 py-2">
          {err}
        </div>
      )}

      {/* Hidden field that prevents the username label from being a no-op
          to TypeScript's unused-var detector. */}
      <span className="hidden">{username}</span>
    </section>
  );
}
