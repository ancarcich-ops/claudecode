"use client";

// "Sign in with Face ID" button on the login page. Drives the WebAuthn
// authentication flow against any passkey the user has previously
// enrolled in Settings. Sits alongside the password form -- doesn't
// replace it -- so the user can still fall back to a password.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startPasskeyAuthenticationAction,
  finishPasskeyAuthenticationAction,
} from "@/lib/actions";

export default function PasskeyLoginButton({ next }: { next: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  // Don't render anything on browsers without WebAuthn -- the password
  // form is still right there.
  if (supported === false) return null;

  const onClick = async () => {
    setError(null);
    setBusy(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = (await startPasskeyAuthenticationAction()) as never;
      const assertion = await startAuthentication({ optionsJSON: options });
      const result = await finishPasskeyAuthenticationAction({
        response: assertion,
        next,
      });
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.push(result.next);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/NotAllowed|cancel/i.test(msg)) setError("Cancelled.");
      else setError(msg);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 my-1">
        <div className="h-px flex-1 bg-borderSoft" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          or
        </span>
        <div className="h-px flex-1 bg-borderSoft" />
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || supported !== true}
        className="h-[52px] rounded-[13px] border border-border bg-panel hover:border-accent/40 transition-colors flex items-center justify-center gap-2.5 font-medium text-[15px] text-ink disabled:opacity-50"
      >
        <FaceIcon />
        {busy ? "Waiting for your device…" : "Sign in with Face ID"}
      </button>
      {error && (
        <p className="font-mono text-[11.5px] text-danger -mt-1">{error}</p>
      )}
    </>
  );
}

function FaceIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M9 10v.01" />
      <path d="M15 10v.01" />
      <path d="M12 10v3" />
      <path d="M9 16c.667.667 1.667 1 3 1s2.333-.333 3-1" />
    </svg>
  );
}
