"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoModeProvider, useDemoMode } from "@/lib/demo/demo-context";

const ownerNav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/reports", label: "Reports" },
  { href: "/owner/documents", label: "My Documents" },
  { href: "/owner/billing", label: "Billing" },
];

function DemoOwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { viewerLabel, withDemoPath } = useDemoMode();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
          <Image src="/luxor-logo.svg" alt="Luxor" width={48} height={48} className="opacity-90 flex-shrink-0" />
          <div className="text-xl font-semibold tracking-wide">Luxor Owner</div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 text-sm">
          {ownerNav.map((item) => {
            const href = withDemoPath(item.href);
            const active = pathname === href;
            return (
              <Link
                key={item.href}
                href={href}
                className={`block px-3 py-2 rounded-lg ${active ? "bg-slate-700" : "hover:bg-slate-800"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-800 text-sm text-slate-400 space-y-1">
          <a href="/contact" className="block hover:text-white">
            Contact us
          </a>
          <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="block hover:text-white">
            Back to luxordev.com
          </a>
          <Link href="/demo" className="block hover:text-white">
            Exit Demo Mode
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
                <div className="text-sm font-semibold text-slate-900">Luxor Owner</div>
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
                {ownerNav.map((item) => {
                  const href = withDemoPath(item.href);
                  const active = pathname === href;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={`block rounded-md px-3 py-2 ${active ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-700"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <Link href="/demo" className="block rounded-md px-3 py-2 text-slate-700">
                  Exit Demo Mode
                </Link>
              </nav>
            </div>
          )}
        </div>
        <div className="hidden md:flex items-center justify-end px-6 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Viewing as {viewerLabel}
          </span>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

export default function DemoOwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoModeProvider audience="owner">
      <DemoOwnerShell>{children}</DemoOwnerShell>
    </DemoModeProvider>
  );
}
