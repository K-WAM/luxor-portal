"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

const sidebarItems = [
  { name: "Dashboard", href: "/tenant" },
  { name: "Documents", href: "/tenant/documents" },
  { name: "Payment", href: "/tenant/payments" },
  { name: "Request Maintenance", href: "/tenant/maintenance" },
  { name: "Contact us", href: "/contact" },
];

export default function TenantLayout({
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
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 bg-gray-900 text-white p-6 flex-col">
        <h2 className="text-xl font-bold mb-6">Tenant Portal</h2>
        <nav className="space-y-2 flex-1">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 rounded transition-colors ${
                  isActive
                    ? "bg-white text-gray-900 font-semibold"
                    : "hover:bg-gray-700"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        {user && (
          <div className="mt-auto pt-6 border-t border-gray-700 space-y-2 text-sm text-gray-400">
            <a href="/contact" className="block hover:text-white">
              Contact us
            </a>
            <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
              Back to luxordev.com
            </a>
            <button
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
              className="text-sm text-gray-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 bg-gray-100">
        <div className="sticky top-0 z-40 bg-gray-100 border-b border-gray-200 md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-700"
              aria-label="Open navigation"
            >
              ☰
            </button>
            <div className="text-sm font-semibold text-gray-800">Tenant Portal</div>
            <div className="w-10" />
          </div>
        </div>
        <div className="hidden md:flex items-center justify-end px-6 pt-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Viewing as {viewerLabel}
            </span>
            {user && (
              <button
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
                className="text-xs text-gray-600 hover:text-gray-900 underline"
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
          <div className="absolute left-0 top-0 h-full w-72 bg-gray-900 text-white p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Tenant Portal</h2>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="text-gray-300 hover:text-white"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-2 flex-1">
              {sidebarItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`block px-4 py-2 rounded transition-colors ${
                      isActive
                        ? "bg-white text-gray-900 font-semibold"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="mt-auto pt-6 border-t border-gray-700 space-y-2 text-sm text-gray-400">
                <a href="/contact" className="block hover:text-white">
                  Contact us
                </a>
                <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
                  Back to luxordev.com
                </a>
                <button
                  onClick={async () => {
                    await signOut();
                    window.location.href = "/";
                  }}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
