"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sidebarItems = [
  { name: "Documents", href: "/tenant/documents" },
  { name: "Payment History", href: "/tenant/payments" },
  { name: "Request Maintenance", href: "/tenant/maintenance" },
];

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-900 text-white p-6">
        <h2 className="text-xl font-bold mb-6">Tenant Portal</h2>
        <nav className="space-y-2">
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
      </aside>
      <main className="flex-1 bg-gray-100">{children}</main>
    </div>
  );
}
