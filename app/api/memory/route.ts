import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/memory?limit=50  — list all memory chunks for the authenticated user
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));

    const { data, error } = await supabase
      .from("memory_chunks")
      .select("id, content, source_type, chat_id, created_at, metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[memory GET]", error.message);
      return new Response(error.message, { status: 500 });
    }

    return Response.json({ chunks: data ?? [] });
  } catch (err) {
    console.error("[memory GET]", err);
    return new Response(String(err), { status: 500 });
  }
}

// DELETE /api/memory?id=<uuid>  — delete a single memory chunk
export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const { error } = await supabase
      .from("memory_chunks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id); // RLS double-check

    if (error) {
      console.error("[memory DELETE]", error.message);
      return new Response(error.message, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[memory DELETE]", err);
    return new Response(String(err), { status: 500 });
  }
}
