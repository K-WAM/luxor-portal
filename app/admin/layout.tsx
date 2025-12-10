"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/properties", label: "Properties" },
  { href: "/admin/maintenance", label: "Maintenance Requests" },
  { href: "/admin/tenants", label: "User Invites" },
  { href: "/admin/documents", label: "Documents" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            Back to Sign In
          </Link>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500">
          Luxor Developments © {new Date().getFullYear()}
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
