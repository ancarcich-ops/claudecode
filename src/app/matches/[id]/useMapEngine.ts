"use client";

import { useEffect, useState } from "react";

// Reads the active map engine from URL (`?map=gl` or `?map=static`)
// with a localStorage fallback so the choice sticks across reloads.
// Defaults to "static" until the GL JS path has feature parity --
// once it does, we'll flip the default and drop the static branch.
export function useMapEngine(): "static" | "gl" {
  const [engine, setEngine] = useState<"static" | "gl">("static");
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
      if (lsOpt === "gl") setEngine("gl");
    } catch {
      // private mode / SSR / sandboxed iframe -- stay on the default.
    }
  }, []);
  return engine;
}
