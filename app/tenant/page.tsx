"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

type Property = {
  id: string;
};

type TenantBill = {
  id: string;
  amount: number;
  due_date: string;
  status: string;
};

type MaintenanceRequest = {
  id: string;
  status: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export default function TenantPortal() {
  const [bills, setBills] = useState<TenantBill[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [dashboardReady, setDashboardReady] = useState(false);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const propRes = await fetch("/api/properties", { cache: "no-store" });
        if (!propRes.ok) throw new Error("Failed to load properties");
        const propertyRows = (await propRes.json()) as Property[];

        const uniquePropertyIds = Array.from(
          new Set((propertyRows || []).map((property) => property.id).filter(Boolean))
        );

        const billingResponses = await Promise.all(
          uniquePropertyIds.map(async (propertyId) => {
            const res = await fetch(`/api/tenant/billing?propertyId=${propertyId}`, {
              cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load tenant bills");
            const data = await res.json();
            return (data.rows || []) as TenantBill[];
          })
        );

        const maintenanceRes = await fetch("/api/maintenance", { cache: "no-store" });
        if (!maintenanceRes.ok) throw new Error("Failed to load maintenance requests");
        const maintenanceRows = (await maintenanceRes.json()) as MaintenanceRequest[];

        setBills(billingResponses.flat());
        setMaintenanceRequests(maintenanceRows || []);
      } catch {
        setBills([]);
        setMaintenanceRequests([]);
      } finally {
        setDashboardReady(true);
      }
    };

    loadDashboardData();
  }, []);

  const paymentStatus = useMemo(() => {
    if (!dashboardReady) return null;

    const today = new Date();
    const todayUtcMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const next30DaysUtcMs = todayUtcMs + 30 * DAY_MS;

    const collectibleBills = bills.filter((bill) => {
      const normalizedStatus = String(bill.status || "").toLowerCase();
      return normalizedStatus !== "paid" && normalizedStatus !== "processing" && normalizedStatus !== "voided";
    });

    const overdueBills = collectibleBills
      .map((bill) => {
        const dueDate = parseDateOnly(bill.due_date);
        return dueDate ? { bill, dueUtcMs: dueDate.getTime() } : null;
      })
      .filter((row): row is { bill: TenantBill; dueUtcMs: number } => !!row && row.dueUtcMs < todayUtcMs)
      .sort((a, b) => a.dueUtcMs - b.dueUtcMs);

    if (overdueBills.length > 0) {
      const selected = overdueBills[0].bill;
      return {
        text: `⚠️ Payment overdue: ${formatCurrency(selected.amount || 0)} (${formatDateOnly(selected.due_date, {
          month: "short",
          day: "numeric",
        })})`,
        className: "text-red-700",
      };
    }

    const upcomingBills = collectibleBills
      .map((bill) => {
        const dueDate = parseDateOnly(bill.due_date);
        return dueDate ? { bill, dueUtcMs: dueDate.getTime() } : null;
      })
      .filter(
        (row): row is { bill: TenantBill; dueUtcMs: number } =>
          !!row && row.dueUtcMs >= todayUtcMs && row.dueUtcMs <= next30DaysUtcMs
      )
      .sort((a, b) => a.dueUtcMs - b.dueUtcMs);

    if (upcomingBills.length > 0) {
      const selected = upcomingBills[0].bill;
      return {
        text: `⏳ Next payment: ${formatCurrency(selected.amount || 0)} due ${formatDateOnly(selected.due_date, {
          month: "short",
          day: "numeric",
        })}`,
        className: "text-amber-700",
      };
    }

    return {
      text: "✅ No payments due",
      className: "text-emerald-700",
    };
  }, [bills, dashboardReady]);

  const maintenanceStatus = useMemo(() => {
    if (!dashboardReady) return null;

    const activeCount = maintenanceRequests.filter((request) => {
      const normalizedStatus = String(request.status || "").toLowerCase();
      return normalizedStatus !== "closed" && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
    }).length;

    if (activeCount <= 0) return null;

    return {
      text:
        activeCount === 1
          ? "🔧 1 open request in progress"
          : `🔧 ${activeCount} active requests`,
      className: "text-blue-700",
    };
  }, [maintenanceRequests, dashboardReady]);

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
          {paymentStatus && (
            <p className={`mt-2 truncate text-sm font-medium ${paymentStatus.className}`}>
              {paymentStatus.text}
            </p>
          )}
        </Link>

        <Link
          href="/tenant/maintenance"
          className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2">Request Maintenance</h3>
          <p className="text-gray-600 text-sm">
            Submit and track maintenance requests.
          </p>
          {maintenanceStatus && (
            <p className={`mt-2 truncate text-sm font-medium ${maintenanceStatus.className}`}>
              {maintenanceStatus.text}
            </p>
          )}
        </Link>
      </div>
    </div>
  );
}
