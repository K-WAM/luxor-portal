"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/properties", label: "Properties" },
  { href: "/admin/financials", label: "Financials" },
  { href: "/admin/maintenance", label: "Maintenance Requests" },
  { href: "/admin/billing", label: "Tenant Billing" },
  { href: "/admin/owner-billing", label: "Owner Billing" },
  { href: "/admin/tenants", label: "User Invites" },
  { href: "/admin/documents", label: "Documents" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, role, loading } = useAuth();
  const viewerLabel = loading
    ? "Checking session..."
    : user?.email
      ? `${user.email} (${role || "role"})`
      : "Not signed in";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
          <Image src="/luxor-logo.svg" alt="Luxor" width={48} height={48} className="opacity-90 flex-shrink-0" />
          <div className="text-xl font-semibold tracking-wide">Luxor Admin</div>
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

        <div className="mt-auto space-y-2 px-6 py-4 border-t border-slate-800 text-sm text-slate-400">
          <Link href="/contact" className="block hover:text-white">
            Contact us
          </Link>
          <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
            Back to luxordev.com
          </a>
          <Link href="/" className="block hover:text-white">
            Back to Sign In
          </Link>
          <div className="text-xs text-slate-500 pt-1">
            Luxor Developments Ac {new Date().getFullYear()}
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 min-w-0">
        <div className="md:hidden border-b border-slate-200 bg-white px-4 py-3 sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Image src="/luxor-logo.svg" alt="Luxor" width={36} height={36} className="opacity-90 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">Luxor Admin</div>
                <div className="text-[11px] text-slate-500 truncate">{viewerLabel}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 bg-white"
            >
              Menu
            </button>
          </div>
          {mobileNavOpen && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <nav className="px-2 py-2 space-y-1 text-sm">
                {adminNav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-md px-3 py-2 ${active ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-700"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <Link href="/contact" className="block rounded-md px-3 py-2 text-slate-700">
                  Contact us
                </Link>
                <Link href="/" className="block rounded-md px-3 py-2 text-slate-700">
                  Back to Sign In
                </Link>
              </nav>
            </div>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end px-6 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Viewing as {viewerLabel}
          </span>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
