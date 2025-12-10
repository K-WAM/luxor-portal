"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

type InviteData = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  properties: {
    id: string;
    address: string;
    lease_start?: string;
    lease_end?: string;
  };
};

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    validateInvite();
  }, [token]);

  const validateInvite = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/invites/${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid or expired invite");
        return;
      }

      setInvite(data);
    } catch (err: any) {
      setError(err.message || "Failed to validate invite");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invite");
      }

      // Redirect to sign in page
      router.push("/?message=Account created successfully. Please sign in.");
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center text-gray-600">Loading...</div>
        </div>
      </main>
    );
  }

  if (error && !invite) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold mb-2 text-gray-900">
              Invalid Invite
            </h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <a
              href="/"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Sign In
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2 text-center">Welcome to Luxor</h1>
        <p className="text-gray-600 text-center mb-6">
          You've been invited to join as a tenant
        </p>

        {invite && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-600 mb-1">Property</div>
            <div className="font-semibold text-gray-900">
              {invite.properties.address}
            </div>
            <div className="text-sm text-gray-600 mt-2">Your Email</div>
            <div className="font-semibold text-gray-900">{invite.email}</div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Create Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re-enter your password"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black text-white py-2 rounded font-medium disabled:opacity-60 hover:bg-gray-800 transition-colors"
          >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <a href="/" className="text-blue-600 hover:text-blue-700 font-medium">
            Sign in here
          </a>
        </div>
      </div>
    </main>
  );
}
