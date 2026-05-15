"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useTransform } from "framer-motion";

// Smoothly animate a number from its previous render value to the new one.
// Replaces a hard '60% -> 65%' snap with a 400ms tween. Drop-in for any
// numeric text that updates after revalidate / poll.
export default function RollingNumber({
  value,
  format = (v) => String(Math.round(v)),
  duration = 0.5,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => format(v));
  const [text, setText] = useState(format(value));
  const last = useRef(value);

  useEffect(() => {
    if (last.current === value) return;
    const controls = animate(mv, value, {
      duration,
      ease: "easeOut",
    });
    last.current = value;
    return () => controls.stop();
  }, [value, mv, duration]);

  useEffect(() => display.on("change", setText), [display]);

  return <span className={className}>{text}</span>;
}
