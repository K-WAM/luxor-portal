import Link from "next/link";

export default function DemoHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Demo Mode</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Sample data only. No real client, property, tenant, payment, or financial data is shown.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/demo/owner" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow">
          <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Owner Demo</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">View Owner Demo</h2>
          <p className="mt-2 text-sm text-slate-600">
            Explore fictional owner dashboard, reports, billing, documents, and maintenance views across three sample properties.
          </p>
        </Link>
        <Link href="/demo/tenant" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow">
          <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Tenant Demo</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">View Tenant Demo</h2>
          <p className="mt-2 text-sm text-slate-600">
            Review a fictional tenant dashboard with one assigned property, sample bills, fake documents, and maintenance requests.
          </p>
        </Link>
      </div>
    </div>
  );
}
