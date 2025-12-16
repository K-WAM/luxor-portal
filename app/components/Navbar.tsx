"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const navItems = [
  { name: "Owner Portal", href: "/owner" },
  { name: "Tenant Portal", href: "/tenant" },
  { name: "Admin Portal", href: "/admin" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, user, signOut, loading } = useAuth();

  const isPortalPage =
    pathname.startsWith("/owner") ||
    pathname.startsWith("/tenant") ||
    pathname.startsWith("/admin");

  // Hide navbar on portal pages for non-admin roles; allow admin to navigate between portals.
  if (isPortalPage && role !== "admin") {
    return null;
  }

  // If not signed in, hide navbar entirely to avoid navigation to other portals.
  if (!user) {
    return null;
  }

  return (
    <nav className="bg-gray-800 text-white px-6 py-3">
      <div className="flex items-center justify-between gap-6">
        <div className="flex gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`hover:text-gray-300 ${
                pathname === item.href ? "font-semibold" : ""
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        {user && (
          <button
            onClick={async () => {
              if (!loading) {
                await signOut();
                router.push("/");
              }
            }}
            className="text-sm text-gray-200 hover:text-white"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
