"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User, Session } from "@supabase/supabase-js";

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
        setRole((sessionUser?.user_metadata?.role as UserRole) ?? null);

        // Re-validate the user from Auth server to ensure fresh metadata
        const { data: userData } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (userData.user) {
          setUser(userData.user);
          setRole((userData.user?.user_metadata?.role as UserRole) ?? null);
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
      const metadataRole = (session?.user?.user_metadata?.role as UserRole) ?? null;
      setUser(session?.user ?? null);
      setRole(metadataRole);
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

      setSession(data.session);
      setUser(userData.user ?? data.user ?? null);
      setRole((userData.user?.user_metadata?.role as UserRole) ?? (data.user?.user_metadata?.role as UserRole) ?? null);
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

export const useAuth = () => useContext(AuthContext);
