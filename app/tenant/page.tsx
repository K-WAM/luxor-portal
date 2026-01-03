"use client";

import Link from "next/link";

export default function TenantPortal() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Welcome to Your Tenant Portal</h1>
      <p className="mb-8 text-gray-700">
        Manage your tenancy from one place. Use the sidebar to navigate.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/tenant/documents"
          className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2">Documents</h3>
          <p className="text-gray-600 text-sm">
            View lease agreements and important documents.
          </p>
        </Link>

        <Link
          href="/tenant/payments"
          className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2">Payment</h3>
          <p className="text-gray-600 text-sm">
            Review your payments and upcoming dues.
          </p>
        </Link>

        <Link
          href="/tenant/maintenance"
          className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2">Request Maintenance</h3>
          <p className="text-gray-600 text-sm">
            Submit and track maintenance requests.
          </p>
        </Link>
      </div>
    </div>
  );
}
