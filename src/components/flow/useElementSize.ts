"use client";

import { useEffect, useRef, useState } from "react";

/** Observe an element's content box — used so charts redraw when the node is resized. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (width: number, height: number) => {
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    update(el.clientWidth, el.clientHeight);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      update(Math.round(width), Math.round(height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}
