"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const navItems = [
  { name: "Sign In", href: "/" },
  { name: "Owner Portal", href: "/owner" },
  { name: "Tenant Portal", href: "/tenant" },
  { name: "Admin Portal", href: "/admin" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { role } = useAuth();

  const isPortalPage =
    pathname.startsWith("/owner") ||
    pathname.startsWith("/tenant") ||
    pathname.startsWith("/admin");

  // Hide navbar on portal pages for non-admin roles; allow admin to navigate between portals.
  if (isPortalPage && role !== "admin") {
    return null;
  }

  return (
    <nav className="bg-gray-800 text-white px-6 py-3">
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
    </nav>
  );
}
