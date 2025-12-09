"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Sign In", href: "/" },
  { name: "Owner Portal", href: "/owner" },
  { name: "Tenant Portal", href: "/tenant" },
  { name: "Admin Portal", href: "/admin" },
];

export default function Navbar() {
  const pathname = usePathname();

  const isPortalPage =
    pathname.startsWith("/owner") ||
    pathname.startsWith("/tenant") ||
    pathname.startsWith("/admin");

  if (isPortalPage) {
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
