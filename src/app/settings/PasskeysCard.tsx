"use client";

// Settings panel for managing passkeys (Face ID / Touch ID / Windows
// Hello / Android fingerprint). Reads/writes via server actions; uses
// @simplewebauthn/browser to drive the WebAuthn API on the client.

import { useEffect, useState, useTransition } from "react";
import {
  startPasskeyRegistrationAction,
  finishPasskeyRegistrationAction,
  removePasskeyAction,
  listMyPasskeysAction,
} from "@/lib/actions";

type Passkey = {
  id: string;
  deviceName: string | null;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
};

export default function PasskeysCard({ initialPasskeys }: { initialPasskeys: Passkey[] }) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // WebAuthn isn't universally supported (older browsers, some
  // in-app webviews). Probe once on mount so the UI either shows the
  // enrollment button or a "not supported" note.
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  const refresh = () => {
    startTransition(async () => {
      const next = await listMyPasskeysAction();
      setPasskeys(next);
    });
  };

  const enroll = async () => {
    setError(null);
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = (await startPasskeyRegistrationAction()) as never;
      const attestation = await startRegistration({ optionsJSON: options });
      const guessed =
        typeof navigator !== "undefined" && /iphone/i.test(navigator.userAgent)
          ? "iPhone"
          : /ipad/i.test(navigator.userAgent ?? "")
            ? "iPad"
            : /mac/i.test(navigator.userAgent ?? "")
              ? "Mac"
              : /android/i.test(navigator.userAgent ?? "")
                ? "Android phone"
                : "This device";
      const result = await finishPasskeyRegistrationAction({
        response: attestation,
        deviceName: guessed,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The browser throws on user cancellation -- surface a kinder copy.
      if (/NotAllowed|cancel/i.test(msg)) {
        setError("Cancelled.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (passkeyId: string) => {
    const fd = new FormData();
    fd.set("passkeyId", passkeyId);
    await removePasskeyAction(fd);
    refresh();
  };

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="font-display text-base font-semibold text-ink">
          Sign in with Face ID
        </h2>
        <span className="text-[11px] text-mute">
          {passkeys.length} device{passkeys.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-[11px] text-mute mb-4">
        Add this device once and you&rsquo;ll sign in with Face ID / Touch ID
        instead of a password. Works on iPhone, iPad, Mac, Android, and
        Windows. Your password stays as a backup.
      </p>

      {passkeys.length > 0 && (
        <ul className="space-y-2 mb-4">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-panel2/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">
                  {p.deviceName ?? "Device"}
                </div>
                <div className="text-[10.5px] text-faint font-mono">
                  Added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt
                    ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}`
                    : " · never used"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-[11px] text-danger hover:text-ink shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported === false ? (
        <p className="text-[12px] text-mute">
          This browser doesn&rsquo;t support passkeys. Try Safari on iPhone /
          Mac, Chrome on Android, or Edge on Windows.
        </p>
      ) : (
        <button
          type="button"
          onClick={enroll}
          disabled={busy || supported !== true}
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {busy
            ? "Waiting for your device…"
            : passkeys.length === 0
              ? "Add this device"
              : "Add another device"}
        </button>
      )}

      {error && (
        <p className="text-[11.5px] text-danger mt-2">{error}</p>
      )}
    </section>
  );
}
