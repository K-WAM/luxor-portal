"use client";

export default function TenantDocuments() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Documents</h1>
      <p className="mb-6 text-gray-700">
        View and download your lease agreements, notices, and other important documents.
      </p>

      <div className="bg-white rounded-lg border p-6">
        <p className="text-gray-500">No documents available yet.</p>
      </div>
    </div>
  );
}
