import nodemailer from "nodemailer";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantBillConnectedAccount } from "@/lib/billing/tenant-connected-account";
import { formatDateOnly } from "@/lib/date-only";
import { getShortPropertyName } from "@/lib/property-short-name";

type StripeSyncStatus = "paid" | "processing" | "due";

type TenantBillRow = {
  id: string;
  property_id: string;
  tenant_id: string | null;
  lease_agreement_id: string | null;
  status: string | null;
  amount: number | null;
  description: string | null;
  due_date: string | null;
  bill_type: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  processing_started_at: string | null;
  payment_link_url: string | null;
  properties?: { address?: string | null } | { address?: string | null }[] | null;
};

type OwnerInvoiceRow = {
  id: string;
  owner_id: string | null;
  property_id: string;
  status: string | null;
  total_due: number | null;
  fee_amount: number | null;
  description: string | null;
  due_date: string | null;
  category: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  processing_started_at: string | null;
  payment_link_url: string | null;
  properties?: { address?: string | null } | { address?: string | null }[] | null;
};

type StatusChangeNotification = {
  billKind: "tenant" | "owner";
  propertyAddress: string;
  contactName?: string | null;
  contactEmail?: string | null;
  amount: number | null;
  description?: string | null;
  dueDate?: string | null;
  oldStatus: string | null;
  newStatus: StripeSyncStatus;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  connectedAccountId?: string | null;
  billId: string;
};

type RefreshResult = {
  id: string;
  changed: boolean;
  oldStatus: string;
  newStatus: StripeSyncStatus | null;
};

type CronRefreshSummary = {
  tenant: { scanned: number; changed: number; paid: number; processing: number; unchanged: number; skipped: number };
  owner: { scanned: number; changed: number; paid: number; processing: number; unchanged: number; skipped: number };
};

const INTERNAL_PAYMENT_EMAIL = "connect@luxordev.com";

const createTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !pass || !from) {
    return null;
  }
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from,
  };
};

const getPropertyAddress = (properties: TenantBillRow["properties"] | OwnerInvoiceRow["properties"]) => {
  if (!properties) return "";
  if (Array.isArray(properties)) {
    return properties[0]?.address || "";
  }
  return properties.address || "";
};

const normalizeStatus = (value?: string | null) => String(value || "").trim().toLowerCase();

const mapPaymentIntentStatus = (status: Stripe.PaymentIntent.Status): StripeSyncStatus => {
  if (status === "succeeded") return "paid";
  if (status === "canceled" || status === "requires_payment_method") return "due";
  return "processing";
};

const mapCheckoutSessionEventToStatus = (
  eventType: string,
  session: Stripe.Checkout.Session
): StripeSyncStatus | null => {
  if (eventType === "checkout.session.completed") {
    return session.payment_status === "paid" ? "paid" : "processing";
  }
  if (eventType === "checkout.session.async_payment_succeeded") {
    return "paid";
  }
  if (eventType === "checkout.session.async_payment_failed") {
    return "due";
  }
  return null;
};

const getUserInfoMap = async (ids: string[]) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      if (error || !data?.user) {
        return [id, { email: null, name: null }] as const;
      }
      const metadataName = String(data.user.user_metadata?.name || "").trim();
      return [
        id,
        {
          email: data.user.email || null,
          name: metadataName || data.user.email?.split("@")[0] || null,
        },
      ] as const;
    })
  );

  return new Map(entries);
};

const getLeaseTenantLabel = async (leaseAgreementId: string | null) => {
  if (!leaseAgreementId) {
    return { name: null, email: null };
  }

  const { data: tenantLinks, error } = await supabaseAdmin
    .from("lease_agreement_tenants")
    .select("user_id")
    .eq("lease_agreement_id", leaseAgreementId);

  if (error) throw error;

  const userInfoMap = await getUserInfoMap((tenantLinks || []).map((row: any) => row.user_id).filter(Boolean));
  const names = Array.from(userInfoMap.values())
    .map((entry) => entry.name)
    .filter(Boolean);
  const emails = Array.from(userInfoMap.values())
    .map((entry) => entry.email)
    .filter(Boolean);

  return {
    name: names.length ? names.join(", ") : null,
    email: emails.length ? emails.join(", ") : null,
  };
};

const sendInternalPaymentStatusEmail = async (payload: StatusChangeNotification) => {
  if (!["processing", "paid"].includes(payload.newStatus)) {
    return;
  }

  const transport = createTransport();
  if (!transport) {
    console.warn("Skipping internal payment status email; SMTP configuration missing.", {
      billKind: payload.billKind,
      billId: payload.billId,
      newStatus: payload.newStatus,
    });
    return;
  }

  const propertyShortName = getShortPropertyName(payload.propertyAddress);
  const subject = `[Luxor] ${payload.billKind === "tenant" ? "Tenant" : "Owner"} bill ${payload.newStatus}: ${propertyShortName}`;
  const lines = [
    `Bill type: ${payload.billKind}`,
    `Property: ${propertyShortName} | ${payload.propertyAddress || "Unknown property"}`,
    `Contact: ${payload.contactName || "N/A"}${payload.contactEmail ? ` <${payload.contactEmail}>` : ""}`,
    `Amount: ${payload.amount != null ? `$${Number(payload.amount).toFixed(2)}` : "N/A"}`,
    `Description: ${payload.description || "N/A"}`,
    `Due date: ${formatDateOnly(payload.dueDate) || payload.dueDate || "N/A"}`,
    `Old status: ${payload.oldStatus || "N/A"}`,
    `New status: ${payload.newStatus}`,
    `Stripe session ID: ${payload.stripeSessionId || "N/A"}`,
    `Stripe payment intent ID: ${payload.stripePaymentIntentId || "N/A"}`,
    `Connected account ID: ${payload.connectedAccountId || "N/A"}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Bill ID: ${payload.billId}`,
  ];

  await transport.transporter.sendMail({
    from: transport.from,
    to: INTERNAL_PAYMENT_EMAIL,
    subject,
    text: lines.join("\n"),
  });
};

const updateTenantBillStatus = async (bill: TenantBillRow, nextStatus: StripeSyncStatus, context: {
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  connectedAccountId: string | null;
}) => {
  const currentStatus = normalizeStatus(bill.status);
  if (currentStatus === "paid") {
    return { id: bill.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }
  if (currentStatus === nextStatus) {
    return { id: bill.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, string | null> = {
    status: nextStatus,
    stripe_session_id: context.stripeSessionId,
    stripe_payment_intent_id: context.stripePaymentIntentId,
    updated_at: nowIso,
  };

  if (nextStatus === "paid") {
    updates.paid_date = nowIso.split("T")[0];
    updates.payment_link_url = null;
    updates.processing_started_at = null;
  } else if (nextStatus === "processing") {
    updates.processing_started_at = bill.processing_started_at || nowIso;
  } else {
    updates.processing_started_at = null;
    updates.stripe_session_id = null;
    updates.stripe_payment_intent_id = null;
  }

  const { error } = await supabaseAdmin.from("tenant_bills").update(updates).eq("id", bill.id);
  if (error) throw error;

  let contactName: string | null = null;
  let contactEmail: string | null = null;
  if (bill.tenant_id) {
    const userInfoMap = await getUserInfoMap([bill.tenant_id]);
    const info = userInfoMap.get(bill.tenant_id);
    contactName = info?.name || null;
    contactEmail = info?.email || null;
  } else {
    const leaseContact = await getLeaseTenantLabel(bill.lease_agreement_id);
    contactName = leaseContact.name;
    contactEmail = leaseContact.email;
  }

  await sendInternalPaymentStatusEmail({
    billKind: "tenant",
    billId: bill.id,
    propertyAddress: getPropertyAddress(bill.properties),
    contactName,
    contactEmail,
    amount: bill.amount,
    description: bill.description || bill.bill_type,
    dueDate: bill.due_date,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    stripeSessionId: context.stripeSessionId,
    stripePaymentIntentId: context.stripePaymentIntentId,
    connectedAccountId: context.connectedAccountId,
  });

  return { id: bill.id, changed: true, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
};

const updateOwnerInvoiceStatus = async (invoice: OwnerInvoiceRow, nextStatus: StripeSyncStatus, context: {
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
}) => {
  const currentStatus = normalizeStatus(invoice.status);
  if (currentStatus === "paid") {
    return { id: invoice.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }
  if (currentStatus === nextStatus) {
    return { id: invoice.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, string | null> = {
    status: nextStatus,
    stripe_session_id: context.stripeSessionId,
    stripe_payment_intent_id: context.stripePaymentIntentId,
    updated_at: nowIso,
  };

  if (nextStatus === "paid") {
    updates.paid_date = nowIso.split("T")[0];
    updates.payment_link_url = null;
    updates.processing_started_at = null;
  } else if (nextStatus === "processing") {
    updates.processing_started_at = invoice.processing_started_at || nowIso;
  } else {
    updates.processing_started_at = null;
    updates.stripe_session_id = null;
    updates.stripe_payment_intent_id = null;
  }

  const { error } = await supabaseAdmin.from("billing_invoices").update(updates).eq("id", invoice.id);
  if (error) throw error;

  let contactName: string | null = null;
  let contactEmail: string | null = null;
  if (invoice.owner_id) {
    const userInfoMap = await getUserInfoMap([invoice.owner_id]);
    const info = userInfoMap.get(invoice.owner_id);
    contactName = info?.name || null;
    contactEmail = info?.email || null;
  }

  await sendInternalPaymentStatusEmail({
    billKind: "owner",
    billId: invoice.id,
    propertyAddress: getPropertyAddress(invoice.properties),
    contactName,
    contactEmail,
    amount: invoice.total_due ?? invoice.fee_amount,
    description: invoice.description || invoice.category,
    dueDate: invoice.due_date,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    stripeSessionId: context.stripeSessionId,
    stripePaymentIntentId: context.stripePaymentIntentId,
    connectedAccountId: null,
  });

  return { id: invoice.id, changed: true, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
};

export const syncTenantBillsFromCheckoutSession = async (session: Stripe.Checkout.Session, eventType: string) => {
  const tenantBillIds = session.metadata?.billIds
    ? session.metadata.billIds.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  if (!tenantBillIds.length) {
    return { updated: 0, skipped: 0 };
  }

  const nextStatus = mapCheckoutSessionEventToStatus(eventType, session);
  if (!nextStatus) {
    return { updated: 0, skipped: tenantBillIds.length };
  }

  const { data, error } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, properties(address)")
    .in("id", tenantBillIds);

  if (error) throw error;

  const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  let updated = 0;
  for (const bill of (data || []) as TenantBillRow[]) {
    const routing = await resolveTenantBillConnectedAccount(bill.property_id);
    const result = await updateTenantBillStatus(bill, nextStatus, {
      stripeSessionId: nextStatus === "due" ? null : session.id,
      stripePaymentIntentId: nextStatus === "due" ? null : currentPaymentIntentId,
      connectedAccountId: routing.connectedAccountId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: tenantBillIds.length - updated };
};

export const syncOwnerInvoicesFromCheckoutSession = async (session: Stripe.Checkout.Session, eventType: string) => {
  const invoiceIds = session.metadata?.luxor_invoice_ids
    ? session.metadata.luxor_invoice_ids.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  if (!invoiceIds.length) {
    return { updated: 0, skipped: 0 };
  }

  const nextStatus = mapCheckoutSessionEventToStatus(eventType, session);
  if (!nextStatus) {
    return { updated: 0, skipped: invoiceIds.length };
  }

  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, properties(address)")
    .in("id", invoiceIds);

  if (error) throw error;

  const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  let updated = 0;
  for (const invoice of (data || []) as OwnerInvoiceRow[]) {
    const result = await updateOwnerInvoiceStatus(invoice, nextStatus, {
      stripeSessionId: nextStatus === "due" ? null : session.id,
      stripePaymentIntentId: nextStatus === "due" ? null : currentPaymentIntentId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: invoiceIds.length - updated };
};

export const refreshTenantBillStripeStatus = async (billId: string) => {
  const { data, error } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, properties(address)")
    .eq("id", billId)
    .maybeSingle();

  if (error) throw error;
  const bill = data as TenantBillRow | null;
  if (!bill) {
    return { ok: false, reason: "not_found" as const };
  }

  const routing = await resolveTenantBillConnectedAccount(bill.property_id);
  if (!routing.paymentAvailable || !routing.connectedAccountId) {
    return { ok: false, reason: "payment_unavailable" as const };
  }

  if (!bill.stripe_session_id && !bill.stripe_payment_intent_id) {
    return { ok: false, reason: "missing_stripe_ids" as const };
  }

  let nextStatus: StripeSyncStatus | null = null;
  let latestSessionId: string | null = bill.stripe_session_id;
  let latestPaymentIntentId: string | null = bill.stripe_payment_intent_id;
  let hasStripePayment = false;

  if (bill.stripe_payment_intent_id) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        bill.stripe_payment_intent_id,
        {},
        { stripeAccount: routing.connectedAccountId }
      );
      hasStripePayment = true;
      latestPaymentIntentId = paymentIntent.id;
      nextStatus = mapPaymentIntentStatus(paymentIntent.status);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "resource_missing") throw error;
    }
  }

  if (!nextStatus && bill.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        bill.stripe_session_id,
        { expand: ["payment_intent"] },
        { stripeAccount: routing.connectedAccountId }
      );
      hasStripePayment = true;
      latestSessionId = session.id;

      if (typeof session.payment_intent === "object" && session.payment_intent?.status) {
        latestPaymentIntentId = session.payment_intent.id;
        nextStatus = mapPaymentIntentStatus(session.payment_intent.status);
      } else if (session.payment_status === "paid") {
        nextStatus = "paid";
      } else if (session.status === "expired") {
        nextStatus = "due";
      } else {
        nextStatus = "processing";
      }
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "resource_missing") throw error;
    }
  }

  if (!hasStripePayment || !nextStatus) {
    return { ok: false, reason: "stripe_payment_missing" as const };
  }

  const result = await updateTenantBillStatus(bill, nextStatus, {
    stripeSessionId: latestSessionId,
    stripePaymentIntentId: latestPaymentIntentId,
    connectedAccountId: routing.connectedAccountId,
  });

  return {
    ok: true,
    status: nextStatus,
    changed: result.changed,
  } as const;
};

export const refreshOwnerInvoiceStripeStatus = async (invoiceId: string) => {
  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, properties(address)")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  const invoice = data as OwnerInvoiceRow | null;
  if (!invoice) {
    return { ok: false, reason: "not_found" as const };
  }

  if (!invoice.stripe_session_id && !invoice.stripe_payment_intent_id) {
    return { ok: false, reason: "missing_stripe_ids" as const };
  }

  let nextStatus: StripeSyncStatus | null = null;
  let latestSessionId: string | null = invoice.stripe_session_id;
  let latestPaymentIntentId: string | null = invoice.stripe_payment_intent_id;
  let hasStripePayment = false;

  if (invoice.stripe_payment_intent_id) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
      hasStripePayment = true;
      latestPaymentIntentId = paymentIntent.id;
      nextStatus = mapPaymentIntentStatus(paymentIntent.status);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "resource_missing") throw error;
    }
  }

  if (!nextStatus && invoice.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(invoice.stripe_session_id, {
        expand: ["payment_intent"],
      });
      hasStripePayment = true;
      latestSessionId = session.id;

      if (typeof session.payment_intent === "object" && session.payment_intent?.status) {
        latestPaymentIntentId = session.payment_intent.id;
        nextStatus = mapPaymentIntentStatus(session.payment_intent.status);
      } else if (session.payment_status === "paid") {
        nextStatus = "paid";
      } else if (session.status === "expired") {
        nextStatus = "due";
      } else {
        nextStatus = "processing";
      }
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "resource_missing") throw error;
    }
  }

  if (!hasStripePayment || !nextStatus) {
    return { ok: false, reason: "stripe_payment_missing" as const };
  }

  const result = await updateOwnerInvoiceStatus(invoice, nextStatus, {
    stripeSessionId: latestSessionId,
    stripePaymentIntentId: latestPaymentIntentId,
  });

  return {
    ok: true,
    status: nextStatus,
    changed: result.changed,
  } as const;
};

export const refreshStripePaymentStatuses = async (): Promise<CronRefreshSummary> => {
  const summary: CronRefreshSummary = {
    tenant: { scanned: 0, changed: 0, paid: 0, processing: 0, unchanged: 0, skipped: 0 },
    owner: { scanned: 0, changed: 0, paid: 0, processing: 0, unchanged: 0, skipped: 0 },
  };

  const { data: tenantBills, error: tenantError } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, stripe_session_id, stripe_payment_intent_id")
    .in("status", ["due", "processing", "in_progress"])
    .or("stripe_session_id.not.is.null,stripe_payment_intent_id.not.is.null");
  if (tenantError) throw tenantError;

  for (const bill of tenantBills || []) {
    summary.tenant.scanned += 1;
    const result = await refreshTenantBillStripeStatus(bill.id);
    if (!result.ok) {
      summary.tenant.skipped += 1;
      continue;
    }
    if (result.changed) {
      summary.tenant.changed += 1;
      if (result.status === "paid") summary.tenant.paid += 1;
      if (result.status === "processing") summary.tenant.processing += 1;
    } else {
      summary.tenant.unchanged += 1;
    }
  }

  const { data: ownerInvoices, error: ownerError } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, stripe_session_id, stripe_payment_intent_id")
    .in("status", ["due", "processing", "in_progress"])
    .or("stripe_session_id.not.is.null,stripe_payment_intent_id.not.is.null");
  if (ownerError) throw ownerError;

  for (const invoice of ownerInvoices || []) {
    summary.owner.scanned += 1;
    const result = await refreshOwnerInvoiceStripeStatus(invoice.id);
    if (!result.ok) {
      summary.owner.skipped += 1;
      continue;
    }
    if (result.changed) {
      summary.owner.changed += 1;
      if (result.status === "paid") summary.owner.paid += 1;
      if (result.status === "processing") summary.owner.processing += 1;
    } else {
      summary.owner.unchanged += 1;
    }
  }

  return summary;
};
