"use client";

export default function TenantPayments() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Payment History</h1>
      <p className="mb-6 text-gray-700">
        View your rent payment history and upcoming payments.
      </p>

      <div className="bg-white rounded-lg border p-6">
        <p className="text-gray-500">No payment history available yet.</p>
      </div>
    </div>
  );
}
