"use client";

import { useState, ChangeEvent, FormEvent } from "react";

type OwnerForm = {
  address: string;
  leaseStart: string;
  leaseEnd: string;
};

type SavedProperty = {
  id: number;
  address: string;
  leaseStart: string | null;
  leaseEnd: string | null;
};

export default function OwnerPortal() {
  const [form, setForm] = useState<OwnerForm>({
    address: "",
    leaseStart: "",
    leaseEnd: "",
  });

  const [lastSaved, setLastSaved] = useState<SavedProperty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save property");
      }

      const data: SavedProperty = await res.json();
      setLastSaved(data);
      alert("Property saved to API (in memory for now)");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="card">
        <h1 className="text-3xl font-bold mb-6">Owner Portal</h1>
        <p className="mb-6 text-gray-700">
          Enter your property details. For now this saves to an API endpoint in
          memory – later we&apos;ll connect a real database.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">Property address</label>
            <input
              type="text"
              name="address"
              placeholder="123 Main St, Vancouver, BC"
              value={form.address}
              onChange={handleChange}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Lease start</label>
            <input
              type="date"
              name="leaseStart"
              value={form.leaseStart}
              onChange={handleChange}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Lease end</label>
            <input
              type="date"
              name="leaseEnd"
              value={form.leaseEnd}
              onChange={handleChange}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <button
            type="submit"
            className="mt-4 bg-black text-white px-4 py-2 rounded disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </form>

        {/* Status + preview */}
        <div className="mt-6 text-sm text-gray-700 space-y-2">
          {error && <div className="text-red-600">Error: {error}</div>}
          {lastSaved && (
            <div className="text-green-700">
              Last saved property: <strong>{lastSaved.address}</strong>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <div className="font-semibold mb-1">Live form state:</div>
          <pre className="bg-gray-100 p-3 rounded overflow-x-auto">
            {JSON.stringify(form, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}
