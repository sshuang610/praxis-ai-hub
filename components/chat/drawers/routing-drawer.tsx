"use client";

import { useChatContext } from "@/lib/chat-context";
import {
  PARAMETER_PRESETS,
  BUILTIN_SYSTEM_PROMPT_TEMPLATES,
} from "@/hooks/useChatOrchestrator";
import { LeftDrawer } from "./left-drawer";

// Routing drawer — session-level "how the AI responds" configuration.
// Model, parameter presets, system prompt template, short-memory depth,
// streaming toggle. Migrated from the retired StudioPanel's ControlsTab;
// same orchestrator bindings, new scholarly layout.
export function RoutingDrawer() {
  const ctx = useChatContext();

  return (
    <LeftDrawer
      id="routing"
      title="模型設定 · Model Setting"
      titleId="routing-drawer-title"
    >
      <div className="space-y-6 p-4 text-sm">
        <section aria-label="Quick presets" className="space-y-2">
          <h3 className="text-2xs uppercase tracking-widest text-muted-foreground">
            快速預設 · Presets
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {PARAMETER_PRESETS.map((preset) => {
              const active = ctx.activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    ctx.setTemperature(preset.temperature);
                    ctx.setTopP(preset.topP);
                    ctx.setMaxTokens(preset.maxTokens);
                  }}
                  className={[
                    "inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Inference ──────────────────────────────────── */}
        <section aria-labelledby="routing-inference" className="space-y-4 rounded-md bg-muted/20 p-3">
          <h3 id="routing-inference" className="text-2xs uppercase tracking-widest text-muted-foreground">
            推論 · Inference
          </h3>
          <label className="block space-y-1.5">
            <span className="text-2xs uppercase tracking-widest text-muted-foreground">
              Model
            </span>
            <select
              value={ctx.model}
              onChange={(e) => ctx.setModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {ctx.modelOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "auto" ? "自動 · Auto（系統依題意選模型）" : item}
                </option>
              ))}
            </select>
            <span className="block text-2xs text-muted-foreground">
              {ctx.model === "auto"
                ? "系統會依每則訊息的意圖自動選擇最合適的模型。"
                : "已固定使用此模型，不受自動路由影響。"}
            </span>
          </label>
          <ParamSlider
            label="Temperature"
            value={ctx.temperature}
            onChange={ctx.setTemperature}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <ParamSlider
            label="Top P"
            value={ctx.topP}
            onChange={ctx.setTopP}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <ParamSlider
            label="Max tokens"
            value={ctx.maxTokens}
            onChange={ctx.setMaxTokens}
            min={256}
            max={32000}
            step={256}
            format={(v) => v.toLocaleString()}
          />
        </section>

        {/* ── Context ────────────────────────────────────── */}
        <section aria-labelledby="routing-context" className="space-y-4 rounded-md bg-muted/20 p-3">
          <h3 id="routing-context" className="text-2xs uppercase tracking-widest text-muted-foreground">
            上下文 · Context
          </h3>
          <ParamSlider
            label="對話記憶深度"
            value={ctx.memoryTurns}
            onChange={ctx.setMemoryTurns}
            min={1}
            max={20}
            step={1}
            hint={`每次請求最多包含最近 ${ctx.shortMemoryMessageLimit} 則訊息。`}
          />
        </section>

        {/* ── Identity ───────────────────────────────────── */}
        <section aria-labelledby="routing-identity" className="space-y-4 rounded-md bg-muted/20 p-3">
          <h3 id="routing-identity" className="text-2xs uppercase tracking-widest text-muted-foreground">
            角色 · Identity
          </h3>
          <label className="block space-y-1.5">
            <span className="text-2xs uppercase tracking-widest text-muted-foreground">
              System prompt template
            </span>
            <select
              value={ctx.selectedTemplateId}
              onChange={(e) => ctx.handleSelectTemplate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="">選擇範本…</option>
              {BUILTIN_SYSTEM_PROMPT_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              {ctx.customPromptTemplates.length > 0 ? (
                <optgroup label="Custom">
                  {ctx.customPromptTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={ctx.handleSavePromptTemplate}
                className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-2xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                儲存範本
              </button>
              <button
                type="button"
                onClick={ctx.handleDeletePromptTemplate}
                disabled={!ctx.selectedTemplate?.isCustom}
                className="inline-flex h-7 items-center rounded-md border border-destructive/40 bg-destructive/5 px-2 text-2xs text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                刪除所選範本
              </button>
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-2xs uppercase tracking-widest text-muted-foreground">
              System prompt
            </span>
            <textarea
              rows={5}
              value={ctx.systemPrompt}
              onChange={(e) => ctx.setSystemPrompt(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </label>
        </section>

        <div className="space-y-2 rounded-md border border-border bg-surface-paper p-3 text-xs">
          <div className="font-medium text-foreground">Token 用量</div>
          <div className="text-muted-foreground">
            ≈ {ctx.tokenUsage.estimated.toLocaleString()} tokens · $
            {ctx.tokenUsage.estimatedCost.toFixed(4)}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={ctx.onExport}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            匯出對話紀錄 (JSON)
          </button>
          <button
            type="button"
            onClick={() => void ctx.handleResetCurrentChat()}
            disabled={!ctx.currentChat}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 px-3 text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            清除本次對話
          </button>
        </div>
      </div>
    </LeftDrawer>
  );
}

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-2xs uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums normal-case tracking-normal text-foreground">
          {format ? format(value) : String(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      {hint ? (
        <span className="block text-2xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
