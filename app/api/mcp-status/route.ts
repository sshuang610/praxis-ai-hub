// Local filesystem MCP has been replaced with the built-in readGitHub tool.
// This endpoint is kept for backwards compatibility but always reports disconnected.
export async function GET() {
  return Response.json({ connected: false, dir: null });
}
