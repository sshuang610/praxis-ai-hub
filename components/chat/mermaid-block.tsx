"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

type MermaidBlockProps = {
  code: string;
  id?: string;
};

const MERMAID_LIGHT = {
  background: "#fdfcf9",
  primaryColor: "#f6f3eb",
  primaryTextColor: "#2a2824",
  primaryBorderColor: "#d4cdbc",
  lineColor: "#8a8377",
  secondaryColor: "#ede7d5",
  tertiaryColor: "#f6f3eb",
};

const MERMAID_DARK = {
  background: "#161311",
  primaryColor: "#1f1b17",
  primaryTextColor: "#e8e3d6",
  primaryBorderColor: "#3a332d",
  lineColor: "#6e6558",
  secondaryColor: "#26221d",
  tertiaryColor: "#1f1b17",
};

export function MermaidBlock({ code, id }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const uniqueId = useRef(id || `mermaid-${Math.random().toString(36).slice(2)}`);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Initialize Mermaid; set ready=true only after it completes
  useEffect(() => {
    setReady(false);
    void (async () => {
      const mermaidModule = await import("mermaid");
      mermaidModule.default.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        themeVariables: isDark ? MERMAID_DARK : MERMAID_LIGHT,
        securityLevel: "loose",
      });
      setReady(true);
    })();
  }, [isDark]);

  // Render only after Mermaid is initialized
  useEffect(() => {
    if (!ready) return;
    let mounted = true;
    const trimmed = code.trim();
    if (!trimmed) {
      setSvg("");
      setError(null);
      return;
    }

    void (async () => {
      try {
        const mermaidModule = await import("mermaid");
        // Pre-validate: parse() throws on syntax errors without touching the DOM
        await mermaidModule.default.parse(trimmed);
        if (!mounted) return;
        const renderResult = await mermaidModule.default.render(uniqueId.current, trimmed);
        if (!mounted) return;
        // Guard: Mermaid v11 may return an error SVG containing the bomb emoji
        if (renderResult.svg.includes("💣") || renderResult.svg.includes("Syntax error in text")) {
          setError("圖表語法錯誤 — 請 AI 重新生成");
          setSvg("");
          return;
        }
        setSvg(renderResult.svg);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        const raw = err instanceof Error ? err.message : String(err);
        // Strip Mermaid's verbose internal stack / version noise
        const message = raw.replace(/\s*\(version \S+\)/g, "").replace(/\n[\s\S]*/g, "").trim() || "圖表語法錯誤";
        setError(message);
        setSvg("");
      }
    })();

    return () => {
      mounted = false;
      // Clean up any leftover Mermaid error elements Mermaid v11 injects into <body>
      const stale = document.getElementById(uniqueId.current);
      if (stale) stale.remove();
    };
  }, [code, ready]);

  const handleDownload = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "diagram.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border text-muted-foreground px-3 py-2 text-xs">
        <span>mermaid</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(code)}
            className={`rounded-md border border-border hover:bg-accent px-2 py-1`}
          >
            Copy Source
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!svg}
            className={`rounded-md border border-border hover:bg-accent px-2 py-1 disabled:opacity-50`}
          >
            Download SVG
          </button>
        </div>
      </div>

      <div className="p-3">
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            <p>圖表語法錯誤：{error}</p>
            <p className="mt-1 text-destructive/70">常見問題：缺少括號或引號、節點 ID 含空格。請 AI 修正後重試。</p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] opacity-70">
              {code}
            </pre>
          </div>
        ) : svg ? (
          <div
            ref={containerRef}
            className="mermaid-render flex items-center justify-center overflow-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="py-4 text-center text-xs text-muted-foreground">Rendering diagram...</div>
        )}
      </div>
    </div>
  );
}
