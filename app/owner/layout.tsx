"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

const ownerNav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/documents", label: "My Documents" },
  { href: "/owner/billing", label: "Billing" },
];

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const viewerLabel = loading
    ? "Checking session..."
    : user?.email
      ? `${user.email} (${role || "role"})`
      : "Not signed in";

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col">
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

        {user && (
          <div className="px-6 py-4 border-t border-slate-800">
            <button
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
              className="text-sm text-slate-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-800 text-sm text-slate-400 space-y-1">
          <a href="/contact" className="block hover:text-white">
            Contact us
          </a>
          <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
            Back to luxordev.com
          </a>
          <div className="text-xs text-slate-500 pt-1">
            Luxor Developments Ac {new Date().getFullYear()}
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50">
        <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200 md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700"
              aria-label="Open navigation"
            >
              ☰
            </button>
            <div className="text-sm font-semibold text-slate-800">Luxor Owner</div>
            <div className="w-10" />
          </div>
        </div>
        <div className="hidden md:flex items-center justify-end px-6 pt-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Viewing as {viewerLabel}
            </span>
            {user && (
              <button
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
                className="text-xs text-slate-600 hover:text-slate-800 underline"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-slate-900 text-slate-100 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold tracking-wide">Luxor Owner</div>
                <div className="text-xs text-slate-400 mt-1">
                  Investment Performance Portal
                </div>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="text-slate-300 hover:text-white"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-1 text-sm">
              {ownerNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`block px-3 py-2 rounded-lg ${
                      active ? "bg-slate-700" : "hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="px-6 py-4 border-t border-slate-800">
                <button
                  onClick={async () => {
                    await signOut();
                    window.location.href = "/";
                  }}
                  className="text-sm text-slate-400 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-800 text-sm text-slate-400 space-y-1">
              <a href="/contact" className="block hover:text-white">
                Contact us
              </a>
              <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
                Back to luxordev.com
              </a>
              <div className="text-xs text-slate-500 pt-1">
                Luxor Developments Ac {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
