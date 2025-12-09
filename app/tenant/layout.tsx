"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useEffect } from "react";

const sidebarItems = [
  { name: "Dashboard", href: "/tenant" },
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
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && (!user || role !== "tenant")) {
      router.push("/");
    }
  }, [loading, user, role, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || role !== "tenant") {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-900 text-white p-6 flex flex-col">
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
        <div className="mt-auto pt-6 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">{user.email}</p>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left rounded hover:bg-gray-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-100">{children}</main>
    </div>
  );
}
