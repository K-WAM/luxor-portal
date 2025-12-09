"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useEffect } from "react";

const ownerNav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/documents", label: "My Documents" },
  { href: "/owner/performance", label: "Asset Performance" },
];

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && (!user || role !== "owner")) {
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

  if (!user || role !== "owner") {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-60 border-r bg-white px-4 py-6 flex flex-col">
        <div className="mb-8">
          <div className="text-xs tracking-[0.2em] text-gray-500">LUXOR</div>
          <div className="font-semibold text-gray-900 text-sm">Owner Portal</div>
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

        <div className="mt-auto pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">{user.email}</p>
          <button
            onClick={handleSignOut}
            className="w-full text-left text-sm text-gray-700 hover:text-black"
          >
            Sign Out
          </button>
        </div>

        <div className="mt-6 text-[11px] text-gray-400">
          © {new Date().getFullYear()} Luxor Developments
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
