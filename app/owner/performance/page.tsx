"use client";

export default function OwnerPerformance() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Asset Performance</h1>
      <p className="text-gray-600 mb-6">
        View performance reports for your properties.
      </p>

      <div className="bg-white rounded-lg border p-6">
        <p className="text-gray-500">No performance reports available yet.</p>
      </div>
    </div>
  );
}
