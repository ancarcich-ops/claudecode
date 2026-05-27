"use client";

import { useEffect, useRef, useState } from "react";

// TODO(map-rewrite): This component CSS-scales the entire map view as a
// quick way to get pinch zoom on a static Mapbox satellite image + SVG
// overlays. It works fine up to ~2x but the underlying image is fixed
// resolution so it pixelates past that. The long-term plan is to swap
// HoleMiniMap to Mapbox GL JS (vector tiles, native pinch/pan with
// re-anchoring overlays), at which point this component can be
// retired.

type Props = {
  children: React.ReactNode;
  // Min/max zoom factors. Default 1..3 -- past 3x the underlying
  // static satellite image gets too pixelated to be useful.
  min?: number;
  max?: number;
  // Optional className for the outer container; pinch handlers live on
  // it. The default fills its parent (absolute inset-0).
  className?: string;
};

export default function PinchZoom({
  children,
  min = 1,
  max = 3,
  className = "absolute inset-0 w-full h-full overflow-hidden touch-none",
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Refs (not state) for in-flight gesture so we don't fight React
  // batching on every frame.
  const gesture = useRef<
    | null
    | {
        kind: "pinch";
        startDist: number;
        startScale: number;
        startTx: number;
        startTy: number;
        // Pinch midpoint, in viewport coords, at gesture start.
        midX: number;
        midY: number;
      }
    | {
        kind: "pan";
        startX: number;
        startY: number;
        startTx: number;
        startTy: number;
      }
  >(null);

  // Clamp the translate so the scaled content always covers the
  // viewport. With scale S, the content extends (S-1)*W/2 beyond
  // either edge from the center; that's the absolute pan budget on
  // each axis.
  const clamp = (s: number, x: number, y: number) => {
    const el = outerRef.current;
    if (!el) return { x, y };
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        gesture.current = {
          kind: "pinch",
          startDist: dist(t1, t2),
          startScale: scale,
          startTx: tx,
          startTy: ty,
          // Midpoint relative to the element's center.
          midX:
            (t1.clientX + t2.clientX) / 2 - (rect.left + rect.width / 2),
          midY:
            (t1.clientY + t2.clientY) / 2 - (rect.top + rect.height / 2),
        };
        e.preventDefault();
      } else if (e.touches.length === 1 && scale > 1) {
        gesture.current = {
          kind: "pan",
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startTx: tx,
          startTy: ty,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === "pinch" && e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const d = dist(t1, t2);
        const ratio = d / g.startDist;
        const next = Math.max(min, Math.min(max, g.startScale * ratio));
        // Anchor zoom around the original pinch midpoint so the
        // content under the user's fingers stays roughly where it is.
        const k = next / g.startScale - 1;
        const c = clamp(
          next,
          g.startTx - g.midX * k,
          g.startTy - g.midY * k,
        );
        setScale(next);
        setTx(c.x);
        setTy(c.y);
        e.preventDefault();
      } else if (g.kind === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - g.startX;
        const dy = e.touches[0].clientY - g.startY;
        const c = clamp(scale, g.startTx + dx, g.startTy + dy);
        setTx(c.x);
        setTy(c.y);
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      gesture.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinches surface as wheel events with ctrlKey set.
      // Plain wheel scrolls are ignored so the page can still scroll.
      if (!e.ctrlKey && Math.abs(e.deltaY) < 8) return;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      const factor = Math.exp(-e.deltaY * 0.01);
      const next = Math.max(min, Math.min(max, scale * factor));
      if (next === scale) return;
      const k = next / scale - 1;
      const c = clamp(next, tx - px * k, ty - py * k);
      setScale(next);
      setTx(c.x);
      setTy(c.y);
      e.preventDefault();
    };

    // touchstart needs to be non-passive so preventDefault works.
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scale, tx, ty, min, max]);

  return (
    <div ref={outerRef} className={className}>
      <div
        className="w-full h-full origin-center will-change-transform"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: gesture.current ? "none" : "transform 120ms ease-out",
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          type="button"
          onClick={() => {
            setScale(1);
            setTx(0);
            setTy(0);
          }}
          className="absolute top-2 right-2 z-10 rounded-full bg-black/70 text-white text-[11px] px-2.5 py-1 font-mono"
          aria-label="Reset zoom"
        >
          {scale.toFixed(1)}×
        </button>
      )}
    </div>
  );
}
