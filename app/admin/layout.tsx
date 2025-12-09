"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useEffect } from "react";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/maintenance", label: "Maintenance Requests" },
  { href: "/admin/documents", label: "Documents" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) {
      router.push("/");
    }
  }, [loading, user, role, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="text-xl font-semibold tracking-wide">Luxor Admin</div>
          <div className="text-xs text-slate-400 mt-1">
            Portfolio & Maintenance Hub
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 text-sm">
          {adminNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg ${
                  active ? "bg-slate-700" : "hover:bg-slate-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 mb-2">{user.email}</p>
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-300 hover:text-white"
          >
            Sign Out
          </button>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500">
          Luxor Developments © {new Date().getFullYear()}
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
