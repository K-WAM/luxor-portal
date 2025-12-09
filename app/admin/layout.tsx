// app/admin/layout.tsx
import Link from "next/link";
import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="text-xl font-semibold tracking-wide">Luxor Admin</div>
          <div className="text-xs text-slate-400 mt-1">
            Portfolio & Maintenance Hub
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 text-sm">
          <Link
            href="/admin"
            className="block px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/maintenance"
            className="block px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            Maintenance Requests
          </Link>
          <Link
            href="/admin/documents"
            className="block px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            Documents
          </Link>
        </nav>

        <div className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500">
          Luxor Developments © {new Date().getFullYear()}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
