import Link from "next/link";

export default function DemoHomePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Demo Mode</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Sample data only. No real client, property, tenant, payment, or financial data is shown.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/demo/owner" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow">
          <h2 className="text-2xl font-semibold text-slate-900">View Owner Portal Demo</h2>
          <p className="mt-2 text-sm text-slate-600">
            Open the current Owner Portal layout with fictional portfolio data only.
          </p>
        </Link>
        <Link href="/demo/tenant" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow">
          <h2 className="text-2xl font-semibold text-slate-900">View Tenant Portal Demo</h2>
          <p className="mt-2 text-sm text-slate-600">
            Open the current Tenant Portal layout with fictional resident data only.
          </p>
        </Link>
      </div>
    </div>
  );
}
