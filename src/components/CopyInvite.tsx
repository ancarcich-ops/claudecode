"use client";

import { useEffect, useState } from "react";

type Mode = "idle" | "copied" | "error";

export default function CopyInvite({
  code,
  joinPath = "/groups/join",
}: {
  code: string;
  // Path on the app the shareable link points at. Defaults to the
  // group join route; tournament invites pass "/tournaments/join".
  joinPath?: string;
}) {
  const [linkMode, setLinkMode] = useState<Mode>("idle");
  const [codeMode, setCodeMode] = useState<Mode>("idle");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = origin ? `${origin}${joinPath}?code=${code}` : "";

  const copy = async (text: string, set: (m: Mode) => void) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (LAN dev, older browsers).
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      set("copied");
    } catch {
      set("error");
    }
    setTimeout(() => set("idle"), 1500);
  };

  const linkLabel =
    linkMode === "copied" ? "Copied!" : linkMode === "error" ? "Copy failed" : "Copy link";
  const codeLabel =
    codeMode === "copied" ? "Copied!" : codeMode === "error" ? "Copy failed" : code;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => copy(code, setCodeMode)}
        className="chip font-mono text-xs hover:bg-panel2/70 transition-colors"
        title="Copy invite code"
      >
        {codeLabel}
      </button>
      <button
        type="button"
        onClick={() => inviteUrl && copy(inviteUrl, setLinkMode)}
        disabled={!inviteUrl}
        className="btn btn-ghost text-xs"
        title="Copy a shareable link"
      >
        {linkLabel}
      </button>
    </div>
  );
}
