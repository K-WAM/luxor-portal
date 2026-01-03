"use client";

import { useEffect, useState } from "react";

type OwnerBillingRow = {
  userId: string;
  ownerEmail: string;
  propertyId: string;
  propertyAddress: string;
  ownershipPercentage: number | null;
  zelleEmail: string | null;
  zellePhone: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\d\s.-]{7,}$/;

const isValidPhone = (value: string) => {
  if (!PHONE_REGEX.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

export default function OwnerBillingDetailsPage() {
  const [rows, setRows] = useState<OwnerBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: "email" | "phone"; value: string }>({
    type: "email",
    value: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/owner-billing", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load owner billing details");
      setRows(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load owner billing details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getKey = (row: OwnerBillingRow) => `${row.userId}-${row.propertyId}`;

  const startEdit = (row: OwnerBillingRow) => {
    const type = row.zelleEmail ? "email" : row.zellePhone ? "phone" : "email";
    const value = row.zelleEmail || row.zellePhone || "";
    setEditingKey(getKey(row));
    setForm({ type, value });
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setForm({ type: "email", value: "" });
  };

  const saveZelle = async (row: OwnerBillingRow) => {
    const key = getKey(row);
    const trimmed = form.value.trim();
    if (trimmed) {
      if (form.type === "email" && !EMAIL_REGEX.test(trimmed)) {
        setError("Enter a valid email address.");
        return;
      }
      if (form.type === "phone" && !isValidPhone(trimmed)) {
        setError("Enter a valid phone number.");
        return;
      }
    }

    try {
      setSavingKey(key);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/owner-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.userId,
          propertyId: row.propertyId,
          zelleType: form.type,
          zelleValue: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Zelle details");
      setSuccess("Owner billing details updated.");
      setEditingKey(null);
      setForm({ type: "email", value: "" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save Zelle details");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Owner Billing Details</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Owner Billing Details</h1>
      <p className="text-slate-600 mb-6">
        Track Zelle recipients per owner and property. Use email or phone (one value per owner).
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">
          No owner/property associations found.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Owner Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Zelle Details</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => {
                  const key = getKey(row);
                  const isEditing = editingKey === key;
                  const zelleLabel = row.zelleEmail
                    ? `Email: ${row.zelleEmail}`
                    : row.zellePhone
                      ? `Phone: ${row.zellePhone}`
                      : "Not set";
                  return (
                    <tr key={key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {row.propertyAddress || row.propertyId}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {row.ownerEmail || row.userId}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {isEditing ? (
                          <div className="flex flex-col gap-2 max-w-sm">
                            <select
                              value={form.type}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  type: e.target.value as "email" | "phone",
                                }))
                              }
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
                            >
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                            </select>
                            <input
                              type="text"
                              value={form.value}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, value: e.target.value }))
                              }
                              placeholder={form.type === "email" ? "owner@example.com" : "+1 555 123 4567"}
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                            />
                          </div>
                        ) : (
                          zelleLabel
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveZelle(row)}
                              disabled={savingKey === key}
                              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:bg-blue-300"
                            >
                              {savingKey === key ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={savingKey === key}
                              className="px-3 py-1.5 rounded-md bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs hover:bg-slate-100"
                          >
                            {row.zelleEmail || row.zellePhone ? "Edit" : "Add"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
