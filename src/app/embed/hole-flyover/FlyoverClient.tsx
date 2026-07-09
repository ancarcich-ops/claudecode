"use client";

// Chrome-less, full-viewport wrapper around HolePreview3D, built to be
// loaded inside the iOS on-course GPS "3D" mode via a WKWebView. It
// covers the app shell with a fixed black canvas (the WebView is
// unauthenticated, so most chrome doesn't render anyway) and streams
// the photorealistic Google 3D-Tiles flyover for a single hole.
//
// Live distance: the native app overlays its own hole rail + "to pin"
// panel on top of the WebView, so by default we hide the web HUD
// (?hud=1 restores it for standalone browser testing). The host app
// can push its live GPS fix in via
//   window.postMessage({ type: "sticks:from", lat, lng })
// (or window.__sticksSetFrom(lat, lng)) to anchor the flyover's aim
// distance to the player instead of the tee.

import { useEffect, useState } from "react";
import HolePreview3D from "@/components/HolePreview3D";
import type { HoleEndpoints } from "@/lib/holeFlightPath";

export default function FlyoverClient({
  hole,
  showHud,
}: {
  hole: HoleEndpoints & { number?: number; par?: number; yards?: number };
  showHud: boolean;
}) {
  // Player position, when the host app streams it in. Anchors the
  // aim-distance readout to the golfer rather than the tee.
  const [from, setFrom] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const apply = (lat: unknown, lng: unknown) => {
      const la = Number(lat);
      const ln = Number(lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        setFrom({ lat: la, lng: ln });
      }
    };
    // Bridge 1: postMessage (WKWebView `evaluateJavaScript` posting a
    // string, or the native message handler echoing one back).
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d && typeof d === "object" && d.type === "sticks:from") {
        apply(d.lat, d.lng);
      }
    };
    window.addEventListener("message", onMessage);
    // Bridge 2: a direct global the host can call via
    // evaluateJavaScript("window.__sticksSetFrom(la, ln)").
    (
      window as unknown as {
        __sticksSetFrom?: (lat: number, lng: number) => void;
      }
    ).__sticksSetFrom = (lat, lng) => apply(lat, lng);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#0b0f0d",
      }}
    >
      <HolePreview3D hole={hole} height="100%" hideHud={!showHud} from={from} />
    </div>
  );
}
