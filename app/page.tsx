"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import { createClient } from "@/lib/supabase/client";

function SignInPageInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [processingCode, setProcessingCode] = useState(false);
  const [resolvingRole, setResolvingRole] = useState(false);

  const { signIn, user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const redirectByRole = (userRole: string) => {
    switch (userRole) {
      case "admin":
        router.push("/admin");
        break;
      case "owner":
        router.push("/owner");
        break;
      case "tenant":
        router.push("/tenant");
        break;
      default:
        router.push("/");
    }
  };

  useEffect(() => {
    if (!authLoading && user && role) {
      redirectByRole(role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, role]);

  // If we have a user but no role yet, try resolving from /api/me then redirect.
  useEffect(() => {
    const resolveRole = async () => {
      if (authLoading || resolvingRole) return;
      if (!user || role) return;
      try {
        setResolvingRole(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          return;
        }
        const res = await fetch("/api/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const me = await res.json();
          const resolvedRole = me.role || "admin";
          redirectByRole(resolvedRole);
        } else {
          // Fallback to admin
          redirectByRole("admin");
        }
      } catch (err) {
        redirectByRole("admin");
      } finally {
        setResolvingRole(false);
      }
    };

    resolveRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, role, resolvingRole]);

  // Handle magic link / recovery links that arrive with ?code=...
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || processingCode) return;

    const exchange = async () => {
      setProcessingCode(true);
      setError(null);
      try {
        const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        const userRole = (data.session?.user?.user_metadata as any)?.role;
        if (userRole) {
          redirectByRole(userRole);
        }
      } catch (err: any) {
        setError(err?.message || "Link is invalid or expired. Try again.");
      } finally {
        setProcessingCode(false);
      }
    };

    exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setResetStatus(null);
    if (!email) {
      setError("Enter your email first, then click Forgot password.");
      return;
    }
    try {
      setResetLoading(true);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${baseUrl}/reset-password`,
      });
      setResetStatus("Password reset email sent. Check your inbox for the link.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600 text-lg">Loading...</div>
      </main>
    );
  }

  if (user && role) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600 text-lg">Redirecting...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 gap-4">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900">Luxor Portal</h1>
        <p className="text-gray-600 text-center mb-6">
          Sign in to access your portal
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-200">
            {error}
          </div>
        )}
        {resetStatus && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
            {resetStatus}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded font-medium hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetLoading}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-60"
          >
            {resetLoading ? "Sending reset email..." : "Forgot password?"}
          </button>
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-gray-600">
        <a href="/contact" className="text-blue-600 hover:text-blue-700 mr-3">Contact us</a>
        <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
          luxordev.com
        </a>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-gray-600 text-lg">Loading...</div>
        </main>
      }
    >
      <SignInPageInner />
    </Suspense>
  );
}
