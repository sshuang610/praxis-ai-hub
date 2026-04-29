"use client";

// Local filesystem MCP replaced with built-in readGitHub tool.
// Hook kept for import compatibility; always returns disconnected.
export type MCPStatus = { connected: boolean; dir: string | null };

export function useMCPStatus(): MCPStatus {
  return { connected: false, dir: null };
}
