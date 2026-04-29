"use client";

import { History, Plus, type LucideIcon } from "lucide-react";
import { useChatContext } from "@/lib/chat-context";
import { useDrawer, DrawerId } from "./drawers/drawer-context";
import { FEATURE_META, type FeatureKey } from "./feature-icons";

// 56px permanent column. Order carries meaning:
//   top    — action (new chat) + chats list entry
//   middle — the four "feature-summoning" entries pulled from FEATURE_META
//   bottom — user menu
//
// Each rail button pairs a pictorial icon (first-use discoverability) with a
// hover/focus tooltip showing zh · en · shape-glyph, so identity is consistent
// across rail ↔ meta-line ↔ status strip ↔ drawers without being cryptic on
// first use. Features import from FEATURE_META — changes there flow here.

type Item = {
  kind: "drawer" | "action";
  id: string;
  Icon: LucideIcon;
  glyph: string;
  tone?: string;
  zh: string;
  en: string;
  drawerId?: DrawerId;
  onClick?: () => void;
};

export function LeftRail({ onOpenUserMenu }: { onOpenUserMenu?: () => void }) {
  const ctx = useChatContext();
  const { activeDrawer, toggleDrawer } = useDrawer();

  const groupA: Item[] = [
    {
      kind: "action",
      id: "new",
      Icon: Plus,
      glyph: "+",
      zh: "新對話",
      en: "New chat",
      onClick: () => void ctx.handleCreateChat(),
    },
    {
      kind: "drawer",
      id: "chats",
      Icon: History,
      glyph: "≡",
      zh: "對話紀錄",
      en: "Chats",
      drawerId: "chats",
    },
  ];

  const featureRailItems: Array<{ key: FeatureKey; drawerId: DrawerId }> = [
    { key: "memory", drawerId: "memory" },
    { key: "routing", drawerId: "routing" },
    { key: "tools", drawerId: "tools" },
    { key: "artifact", drawerId: "artifacts" },
  ];

  const groupB: Item[] = featureRailItems.map(({ key, drawerId }) => {
    const meta = FEATURE_META[key];
    return {
      kind: "drawer",
      id: drawerId,
      Icon: meta.Icon,
      glyph: meta.glyph,
      tone: meta.tone,
      zh: meta.zh,
      en: meta.en,
      drawerId,
    };
  });

  const renderItem = (item: Item) => {
    const active = item.kind === "drawer" && activeDrawer === item.drawerId;
    const onClick =
      item.kind === "drawer"
        ? () => toggleDrawer(item.drawerId!)
        : item.onClick;
    const Icon = item.Icon;
    return (
      <button
        key={item.id}
        type="button"
        onClick={onClick}
        aria-label={`${item.zh} · ${item.en}`}
        aria-pressed={item.kind === "drawer" ? active : undefined}
        className={[
          "group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        ].join(" ")}
      >
        <Icon size={18} strokeWidth={1.75} className={item.tone} />
        {active ? (
          <span
            aria-hidden="true"
            className="absolute -left-px top-1/2 h-4 w-px -translate-y-1/2 bg-primary"
          />
        ) : null}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-2xs text-popover-foreground opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="text-foreground">{item.zh}</span>
          <span className="mx-1.5 opacity-60">·</span>
          <span className="text-muted-foreground">{item.en}</span>
          <span
            className={`ml-1.5 ${item.tone || "text-muted-foreground"}`}
            aria-hidden="true"
          >
            {item.glyph}
          </span>
        </span>
      </button>
    );
  };

  const userInitial =
    (ctx.userEmail || "").trim().charAt(0).toUpperCase() || "U";

  return (
    <nav
      aria-label="Praxis rail"
      className="relative flex h-full w-14 flex-none flex-col items-center border-r border-border bg-background py-2"
    >
      <div className="flex flex-col items-center gap-1">
        {groupA.map(renderItem)}
      </div>
      <div aria-hidden="true" className="my-3 h-px w-6 bg-border" />
      <div className="flex flex-col items-center gap-1">
        {groupB.map(renderItem)}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          data-user-menu-trigger
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onOpenUserMenu}
          aria-label={`${ctx.userEmail || "User"} · menu`}
          title={ctx.userEmail || "User"}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-paper text-xs font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {userInitial}
        </button>
      </div>
    </nav>
  );
}
