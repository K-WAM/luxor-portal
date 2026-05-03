"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoModeProvider, useDemoMode } from "@/lib/demo/demo-context";

const tenantNav = [
  { href: "/tenant", label: "Dashboard" },
  { href: "/tenant/documents", label: "Documents" },
  { href: "/tenant/payments", label: "Payment" },
  { href: "/tenant/maintenance", label: "Request Maintenance" },
  { href: "/contact", label: "Contact us" },
];

function DemoTenantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { viewerLabel, withDemoPath } = useDemoMode();

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
          {tenantNav.map((item) => {
            const href = item.href.startsWith("/tenant") ? withDemoPath(item.href) : item.href;
            const isActive = pathname === href;
            return (
              <Link
                key={item.href}
                href={href}
                className={`block px-4 py-2 rounded transition-colors ${
                  isActive ? "bg-white text-gray-900 font-semibold" : "hover:bg-gray-700"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-6 border-t border-gray-700 space-y-2 text-sm text-gray-400">
          <a href="/contact" className="block hover:text-white">
            Contact us
          </a>
          <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
            Back to luxordev.com
          </a>
          <Link href="/demo" className="block hover:text-white">
            Exit Demo Mode
          </Link>
        </div>
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
                {tenantNav.map((item) => {
                  const href = item.href.startsWith("/tenant") ? withDemoPath(item.href) : item.href;
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={`block rounded-md px-3 py-2 ${isActive ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-700"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <Link href="/demo" className="block rounded-md px-3 py-2 text-gray-700">
                  Exit Demo Mode
                </Link>
              </nav>
            </div>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end px-6 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Viewing as {viewerLabel}
          </span>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

export default function DemoTenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoModeProvider audience="tenant">
      <DemoTenantShell>{children}</DemoTenantShell>
    </DemoModeProvider>
  );
}
