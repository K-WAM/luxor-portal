"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const ownerNav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/documents", label: "My Documents" },
];

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, role, loading } = useAuth();
  const viewerLabel = loading
    ? "Checking session..."
    : user?.email
      ? `${user.email} (${role || "role"})`
      : "Not signed in";

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="text-xl font-semibold tracking-wide">Luxor Owner</div>
          <div className="text-xs text-slate-400 mt-1">
            Investment Performance Portal
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 text-sm">
          {ownerNav.map((item) => {
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
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            Back to Sign In
          </Link>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500">
          Luxor Developments Ac {new Date().getFullYear()}
        </div>
      </aside>

      <main className="flex-1 bg-slate-50">
        <div className="flex items-center justify-end px-6 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Viewing as {viewerLabel}
          </span>
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
