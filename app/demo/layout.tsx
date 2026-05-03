import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/route-helpers";

function getDefaultDashboardPath(role: "admin" | "owner" | "tenant" | "viewer" | null) {
  if (role === "admin") return "/admin";
  if (role === "owner") return "/owner";
  if (role === "tenant") return "/tenant";
  return "/";
}

export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await getAuthContext();

  if (!user || role !== "admin") {
    redirect(getDefaultDashboardPath(role));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Demo Mode - Sample data only. No real client or payment data is shown.
            </div>
            <div className="text-xs text-amber-800">Admin-only demonstration environment. All payment state resets on refresh.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/demo" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Demo Home
            </Link>
            <Link href="/admin" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Back to Admin
            </Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
