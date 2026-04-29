"use client";

import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useDrawer, DrawerId } from "./drawer-context";

const MIN_W = 200;
const MAX_W = 720;

function clampW(w: number) {
  return Math.max(MIN_W, Math.min(MAX_W, w));
}

function storageKey(id: DrawerId) {
  return `praxis-left-drawer-w-${id}`;
}

// Shared primitive for left-side drawers (Chats / Memory / Routing / Tools).
// - Push-style: occupies flex space so conversation column resizes alongside.
// - Width is draggable (pointer capture on the resize handle) and persisted.
// - prefers-reduced-motion degrades to opacity-only.
export function LeftDrawer({
  id,
  title,
  titleId,
  children,
  headerRight,
}: {
  id: DrawerId;
  title: string;
  titleId: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const { activeDrawer, closeDrawer } = useDrawer();
  const prefersReduced = useReducedMotion();
  const panelRef = useRef<HTMLElement | null>(null);
  const isOpen = activeDrawer === id;

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 360;
    const saved = localStorage.getItem(storageKey(id));
    return saved ? clampW(Number(saved)) : 360;
  });

  const isDraggingRef = useRef(false);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = width;
      isDraggingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        const newW = clampW(startW + ev.clientX - startX);
        setWidth(newW);
      };
      const onUp = (ev: PointerEvent) => {
        isDraggingRef.current = false;
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        localStorage.setItem(storageKey(id), String(clampW(startW + ev.clientX - startX)));
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    },
    [id, width],
  );

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeDrawer]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.section
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={prefersReduced ? { opacity: 0, width } : { opacity: 0, width: 0 }}
          animate={{ opacity: 1, width }}
          exit={prefersReduced ? { opacity: 0, width } : { opacity: 0, width: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex-none overflow-hidden border-r border-border bg-background shadow-[2px_0_16px_-8px_oklch(0_0_0/0.15)] focus-visible:outline-none"
        >
          {/* Inner wrapper at exact width so content doesn't reflow during animation */}
          <div className="flex h-full flex-col" style={{ width }}>
            <header className="flex h-11 flex-none items-center justify-between border-b border-border px-4">
              <h2 id={titleId} className="text-sm font-medium text-foreground">
                {title}
              </h2>
              <div className="flex items-center gap-1">
                {headerRight}
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close drawer"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </div>

          {/* Resize handle — sits on the right edge */}
          <div
            onPointerDown={handleResizePointerDown}
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/25 active:bg-primary/40"
          />
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
