"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/demo", label: "Demo Mode" },
  { href: "/admin/properties", label: "Properties" },
  { href: "/admin/financials", label: "Financials" },
  { href: "/admin/maintenance", label: "Maintenance Requests" },
  { href: "/admin/billing", label: "Tenant Billing" },
  { href: "/admin/owner-billing", label: "Owner Billing" },
  { href: "/admin/services-billing", label: "Services Billing" },
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
          <div className="flex items-center gap-3 pt-1">
            <a href="https://www.facebook.com/people/Luxor-Developments/61576973897778/" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" title="Facebook">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="https://www.instagram.com/luxor_dev/" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" title="Instagram">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="https://ca.linkedin.com/company/luxordev" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" title="LinkedIn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
          </div>
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
