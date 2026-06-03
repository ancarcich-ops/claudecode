"use client";

import { useEffect, useState } from "react";

// Reads the active map engine from URL (`?map=gl` or `?map=static`)
// with a localStorage fallback so the choice sticks across reloads.
// Default is "gl" (Mapbox GL JS): native pinch/pan/zoom, vector
// tiles, declustering, preset-chip animations all live on this
// path. The "static" engine remains as a tap-of-the-URL fallback
// (?map=static) for one release in case anything regresses.
export function useMapEngine(): "static" | "gl" {
  const [engine, setEngine] = useState<"static" | "gl">("gl");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const urlOpt = params.get("map");
      if (urlOpt === "gl") {
        setEngine("gl");
        localStorage.setItem("mapEngine", "gl");
        return;
      }
      if (urlOpt === "static") {
        setEngine("static");
        localStorage.setItem("mapEngine", "static");
        return;
      }
      const lsOpt = localStorage.getItem("mapEngine");
      if (lsOpt === "static") setEngine("static");
    } catch {
      // private mode / SSR / sandboxed iframe -- stay on the default.
    }
  }, []);
  return engine;
}
