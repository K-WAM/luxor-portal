"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useDemoMode } from "@/lib/demo/demo-context";

type UserRole = "tenant" | "owner" | "admin" | null;

type AuthContextType = {
  user: User | null;
  session: Session | null;
  role: UserRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const resolveRoleFromApi = async (accessToken?: string | null): Promise<UserRole> => {
    if (!accessToken) return null;
    try {
      const res = await fetch("/api/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.role as UserRole) ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadAuthState = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user ?? null;
        if (!isMounted) return;

        setSession(sessionData.session);
        setUser(sessionUser);
        setRole(null);

        // Re-validate the user from Auth server to ensure fresh metadata
        const { data: userData } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (userData.user) {
          setUser(userData.user);
          const resolvedRole =
            (await resolveRoleFromApi(sessionData.session?.access_token || null)) ??
            ((userData.user?.user_metadata?.role as UserRole) ?? null);
          setRole(resolvedRole);
        }
      } catch (err) {
        console.error("Failed to load auth state", err);
        if (!isMounted) return;
        setSession((prev) => prev);
        setUser((prev) => prev);
        setRole((prev) => prev);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const resolvedRole =
          (await resolveRoleFromApi(session.access_token || null)) ??
          ((session.user.user_metadata?.role as UserRole) ?? null);
        if (!isMounted) return;
        setRole(resolvedRole);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error: error.message };

      const { data: userData } = await supabase.auth.getUser();
      const resolvedRole =
        (await resolveRoleFromApi(data.session?.access_token || null)) ??
        ((userData.user?.user_metadata?.role as UserRole) ?? (data.user?.user_metadata?.role as UserRole) ?? null);

      setSession(data.session);
      setUser(userData.user ?? data.user ?? null);
      setRole(resolvedRole);
      setLoading(false);

      return { error: null };
    } catch (err: any) {
      setLoading(false);
      return { error: err.message || "Failed to sign in" };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const auth = useContext(AuthContext);
  const demo = useDemoMode();

  if (!demo.active) {
    return auth;
  }

  return {
    ...auth,
    user: {
      id: `demo-${demo.authOverride.role}`,
      email: demo.authOverride.email,
      user_metadata: {
        name: demo.authOverride.name,
        role: demo.authOverride.role,
      },
    } as unknown as User,
    session: null,
    role: demo.authOverride.role,
    loading: false,
    signIn: auth.signIn,
    signOut: async () => {
      window.location.href = "/demo";
    },
  };
};
