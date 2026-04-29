"use client";

import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useDrawer, DrawerId } from "./drawer-context";

const MIN_W = 280;
const MAX_W = 900;
const DEFAULT_W = 440;

function clampW(w: number) {
  return Math.max(MIN_W, Math.min(MAX_W, w));
}

function storageKey(id: DrawerId) {
  return `praxis-right-drawer-w-${id}`;
}

// Push-style right drawer (Artifacts, Research). Width animates from 0 so the
// conversation column actually shrinks. Width is draggable via the left edge
// handle and persisted to localStorage. prefers-reduced-motion → instant snap.
export function RightDrawer({
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
    if (typeof window === "undefined") return DEFAULT_W;
    const saved = localStorage.getItem(storageKey(id));
    return saved ? clampW(Number(saved)) : DEFAULT_W;
  });

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = width;

      const onMove = (ev: PointerEvent) => {
        // Dragging left → wider; dragging right → narrower
        const newW = clampW(startW - (ev.clientX - startX));
        setWidth(newW);
      };
      const onUp = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        localStorage.setItem(storageKey(id), String(clampW(startW - (ev.clientX - startX))));
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
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={prefersReduced ? { width } : { width: 0 }}
          animate={{ width }}
          exit={prefersReduced ? { width } : { width: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex-none overflow-hidden border-l border-border bg-background focus-visible:outline-none"
        >
          {/* Resize handle — left edge, drag left to widen */}
          <div
            onPointerDown={handleResizePointerDown}
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/25 active:bg-primary/40"
          />

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
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
