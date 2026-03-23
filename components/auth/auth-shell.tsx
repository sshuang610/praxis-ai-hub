"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ChatInterface } from "@/components/chat/chat-interface";

type AuthMode = "signin" | "signup";

export function AuthShell() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
          },
        });
        if (error) throw error;
        setMessage("註冊成功，請到信箱點擊驗證連結。若開啟 Email OTP，可直接收登入碼。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage("登入成功。");
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Authentication failed";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    setMessage("");
    setBusy(true);
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
    } catch (err) {
      const text = err instanceof Error ? err.message : "OAuth login failed";
      setMessage(text);
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const user: User | null = session?.user ?? null;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading session...</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 backdrop-blur">
          <h1 className="font-mono text-lg text-zinc-100">My own GPT</h1>
          <p className="mt-1 text-xs text-zinc-400">Supabase Auth: Email/Password + OAuth</p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={[
                "rounded-md px-3 py-2",
                mode === "signin" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800",
              ].join(" ")}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={[
                "rounded-md px-3 py-2",
                mode === "signup" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800",
              ].join(" ")}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="mt-4 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              minLength={6}
              required
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-60"
            >
              {mode === "signin" ? "Sign In with Email" : "Create Account"}
            </button>
          </form>

          <div className="my-4 h-px bg-zinc-800" />

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleOAuth("github")}
              disabled={busy}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            >
              Continue with GitHub
            </button>
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={busy}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            >
              Continue with Google
            </button>
          </div>

          {message ? <p className="mt-4 text-xs text-zinc-400">{message}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <ChatInterface
      userId={user.id}
      userEmail={user.email || ""}
      onSignOut={() => {
        void handleSignOut();
      }}
    />
  );
}
