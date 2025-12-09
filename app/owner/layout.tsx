"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ownerNav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/documents", label: "My documents" },
  // later: { href: "/owner/performance", label: "My performance" },
];

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-white px-4 py-6 flex flex-col">
        <div className="mb-8">
          <div className="text-xs tracking-[0.2em] text-gray-500">
            LUXOR
          </div>
          <div className="font-semibold text-gray-900 text-sm">
            Owner Portal
          </div>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          {ownerNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "block rounded-md px-3 py-2 " +
                  (active
                    ? "bg-black text-white"
                    : "text-gray-800 hover:bg-gray-100")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 text-[11px] text-gray-400">
          © {new Date().getFullYear()} Luxor Developments
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
