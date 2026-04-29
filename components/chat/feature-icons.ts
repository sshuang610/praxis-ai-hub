import {
  BookOpen,
  FileCode,
  GitBranch,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for the four "feature" identities used across
// rail · meta-line · status-strip · welcome hero · drawers · palette.
//
// Every consumer imports FEATURE_META so a change here (icon, tone, glyph,
// bilingual label) flows everywhere automatically and identity never drifts
// between surfaces.

export type FeatureKey = "memory" | "routing" | "tools" | "artifact";

export type FeatureMeta = {
  Icon: LucideIcon;
  tone: string;   // Tailwind text color class for the feature accent
  glyph: string;  // Unicode shape glyph (retained for tooltips / fallbacks)
  zh: string;
  en: string;
};

export const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  memory: {
    Icon: BookOpen,
    tone: "text-memory",
    glyph: "○",
    zh: "長期記憶",
    en: "Memory",
  },
  routing: {
    Icon: GitBranch,
    tone: "text-routing",
    glyph: "■",
    zh: "模型設定",
    en: "Model Setting",
  },
  tools: {
    Icon: Wrench,
    tone: "text-tool",
    glyph: "◆",
    zh: "工具",
    en: "Tools",
  },
  artifact: {
    Icon: FileCode,
    tone: "text-artifact",
    glyph: "▲",
    zh: "產物",
    en: "Artifact",
  },
};
