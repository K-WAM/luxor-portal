"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, role, loading, signOut } = useAuth();
  const viewerLabel = loading
    ? "Checking session..."
    : user?.email
      ? `${user.email} (${role || "role"})`
      : "Not signed in";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 bg-gray-900 text-white p-6 flex-col">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <Image src="/luxor-logo.svg" alt="Luxor" width={48} height={48} className="opacity-90 flex-shrink-0" />
          <div className="text-xl font-bold">Luxor</div>
        </div>
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
            <div className="flex items-center gap-3 py-1">
              <a href="https://www.facebook.com/people/Luxor-Developments/61576973897778/" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white" title="Facebook">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
              <a href="https://www.instagram.com/luxor_dev/" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white" title="Instagram">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
              <a href="https://ca.linkedin.com/company/luxordev" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white" title="LinkedIn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
            </div>
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
      <main className="flex-1 bg-gray-100 min-w-0">
        <div className="md:hidden border-b border-gray-200 bg-white px-4 py-3 sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Image src="/luxor-logo.svg" alt="Luxor" width={36} height={36} className="opacity-90 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Luxor Tenant</div>
                <div className="text-[11px] text-gray-500 truncate">{viewerLabel}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 bg-white"
            >
              Menu
            </button>
          </div>
          {mobileNavOpen && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <nav className="px-2 py-2 space-y-1 text-sm">
                {sidebarItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-md px-3 py-2 ${isActive ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700"}`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
                {user && (
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      router.push("/");
                    }}
                    className="block w-full text-left rounded-md px-3 py-2 text-gray-700"
                  >
                    Sign out
                  </button>
                )}
              </nav>
            </div>
          )}
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
    </div>
  );
}
