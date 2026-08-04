"use client";

import { useCallback, type PointerEvent, type RefObject } from "react";

// Writes pointer position straight to CSS custom properties on the given
// element via style.setProperty, so the holo sheen (globals.css) can track
// the cursor without triggering a React re-render on every pointermove.
export function useTiltPointer(ref: RefObject<HTMLElement | null>) {
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--px", `${px}%`);
      el.style.setProperty("--py", `${py}%`);
    },
    [ref]
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--px", "50%");
    el.style.setProperty("--py", "35%");
  }, [ref]);

  return { onPointerMove, onPointerLeave };
}
