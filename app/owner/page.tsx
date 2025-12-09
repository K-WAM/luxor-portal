"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from "react";

type OwnerForm = {
  address: string;
  leaseStart: string;
  leaseEnd: string;
};

type Property = {
  id: string;
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

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load properties from API on first load
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/properties");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load");
        }
        const data: Property[] = await res.json();
        setProperties(data);
      } catch (err) {
        console.error(err);
        setError("Could not load saved properties.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save property");
      }

      // Add the new property to the top of the list
      setProperties((prev) => [data, ...prev]);

      // Clear form
      setForm({
        address: "",
        leaseStart: "",
        leaseEnd: "",
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong saving the property.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this property?")) return;

    try {
      setError(null);
      const res = await fetch(`/api/properties?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete property");
      }

      setProperties((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong deleting the property.");
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Owner dashboard</h1>
      <p className="mb-6 text-gray-700 text-sm">
        (Temporary admin-style view.) Here you can enter properties that will
        later be linked to your owner login, documents, and performance reports.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-2 bg-black text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save property"}
        </button>

        {error && (
          <p className="mt-2 text-sm text-red-600">Error: {error}</p>
        )}
      </form>

      <hr className="my-6" />

      <div>
        <h2 className="text-xl font-semibold mb-3">Saved properties</h2>

        {loading && <p>Loading properties…</p>}

        {!loading && properties.length === 0 && (
          <p className="text-gray-600 text-sm">
            No properties yet. Add one above.
          </p>
        )}

        <ul className="space-y-3">
          {properties.map((p) => (
            <li
              key={p.id}
              className="border rounded px-3 py-2 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{p.address}</div>
                <div className="text-sm text-gray-600">
                  {p.leaseStart
                    ? `Lease: ${p.leaseStart} → ${
                        p.leaseEnd || "Open-ended"
                      }`
                    : "No lease dates set"}
                </div>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-sm border border-red-500 text-red-600 px-2 py-1 rounded hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
