"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { formatDateOnly } from "@/lib/date-only";
import {
  getServicesInvoiceDisplayStatus,
  getServicesInvoiceShortDescription,
  getServicesInvoiceStatusBadgeClass,
} from "@/lib/services-billing";

type PublicServicesInvoice = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  companyName?: string | null;
  description: string;
  lineItems: { description: string; amount: number }[];
  issueDate: string;
  dueDate: string;
  subtotal: number;
  total: number;
  notes?: string | null;
  status: string;
  paidDate?: string | null;
  pdfUrl?: string | null;
  token: string;
};

const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED = 0.3;
const ACH_FEE_RATE = 0.008;
const ACH_FEE_CAP = 5;

export default function ServicesInvoicePage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params?.token;
  const [invoice, setInvoice] = useState<PublicServicesInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<"bank" | "card" | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/services-billing/${token}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load invoice");
        setInvoice(data);
      } catch (err: any) {
        setError(err.message || "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    if (token) load();
  }, [token]);

  const displayStatus = useMemo(
    () => getServicesInvoiceDisplayStatus(invoice?.status, invoice?.dueDate),
    [invoice?.status, invoice?.dueDate]
  );

  const achFee = Math.min(Number(invoice?.total || 0) * ACH_FEE_RATE, ACH_FEE_CAP);
  const cardFee = Number(invoice?.total || 0) * CARD_FEE_RATE + CARD_FEE_FIXED;

  const startCheckout = async (method: "bank" | "card") => {
    if (!invoice) return;
    try {
      setCheckoutLoading(method);
      setError(null);
      const res = await fetch("/api/services-billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invoice.token, method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-slate-600">Loading invoice...</div>;
  }

  if (error || !invoice) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-red-600">{error || "Invoice not found"}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Luxor Developments LLC</div>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Services Invoice</h1>
            <div className="mt-2 text-sm text-slate-600">{invoice.invoiceNumber}</div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getServicesInvoiceStatusBadgeClass(displayStatus)}`}>
              {displayStatus}
            </span>
            {searchParams.get("checkout") === "success" && (
              <div className="text-sm text-emerald-700">Payment initiated successfully.</div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Bill To</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{invoice.clientName}</div>
            {invoice.companyName && <div className="text-sm text-slate-700">{invoice.companyName}</div>}
            <div className="text-sm text-slate-600">{invoice.clientEmail}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
            <div>Issue Date: {formatDateOnly(invoice.issueDate) || "-"}</div>
            <div className="mt-1">Due Date: {formatDateOnly(invoice.dueDate) || "-"}</div>
            {invoice.paidDate && <div className="mt-1">Paid Date: {formatDateOnly(invoice.paidDate) || "-"}</div>}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Services</div>
          <div className="mt-2 text-sm text-slate-800">{getServicesInvoiceShortDescription(invoice.description)}</div>
          <div className="mt-4 space-y-2">
            {invoice.lineItems.map((item, index) => (
              <div key={`${item.description}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                <div className="text-slate-700">{item.description}</div>
                <div className="font-medium text-slate-900">${Number(item.amount || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
          {invoice.notes && <div className="mt-4 text-sm text-slate-600">Notes: {invoice.notes}</div>}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span>Subtotal</span>
              <span>${Number(invoice.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>${Number(invoice.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Zelle</div>
            <div className="mt-2 text-sm font-medium text-slate-900">connect@luxordev.com</div>
            <div className="mt-1 text-xs text-slate-500">No processing fee. Luxor will mark the invoice paid after confirmation.</div>
          </div>
          <button
            type="button"
            onClick={() => startCheckout("bank")}
            disabled={checkoutLoading !== null || displayStatus === "Paid" || displayStatus === "Void"}
            className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-4 text-left hover:bg-slate-200 disabled:opacity-60"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">ACH Bank Transfer</div>
            <div className="mt-2 text-sm font-medium text-slate-900">Pay by bank</div>
            <div className="mt-1 text-xs text-slate-500">Estimated fee: ${achFee.toFixed(2)}</div>
          </button>
          <button
            type="button"
            onClick={() => startCheckout("card")}
            disabled={checkoutLoading !== null || displayStatus === "Paid" || displayStatus === "Void"}
            className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-4 text-left hover:bg-slate-200 disabled:opacity-60"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">Credit Card</div>
            <div className="mt-2 text-sm font-medium text-slate-900">Pay by card</div>
            <div className="mt-1 text-xs text-slate-500">Estimated fee: ${cardFee.toFixed(2)}</div>
          </button>
        </div>

        {invoice.pdfUrl && (
          <div className="mt-6">
            <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:text-blue-700">
              Download PDF
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
