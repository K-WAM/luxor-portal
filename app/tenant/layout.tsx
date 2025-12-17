"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const sidebarItems = [
  { name: "Dashboard", href: "/tenant" },
  { name: "Documents", href: "/tenant/documents" },
  { name: "Payment History", href: "/tenant/payments" },
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
  const viewerLabel = loading
    ? "Checking session..."
    : user?.email
      ? `${user.email} (${role || "role"})`
      : "Not signed in";

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
        {user && (
          <div className="mt-auto pt-6 border-t border-gray-700">
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
        <div className="flex items-center justify-end px-6 pt-4">
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
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
