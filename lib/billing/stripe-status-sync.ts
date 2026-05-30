import nodemailer from "nodemailer";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantBillConnectedAccount } from "@/lib/billing/tenant-connected-account";
import { getShortPropertyName } from "@/lib/property-short-name";
import { CANONICAL_PORTAL_URL } from "@/lib/email/payments-due-soon";

type StripeSyncStatus = "paid" | "processing" | "due";
type FailedPaymentStatus = "failed" | "canceled" | "expired" | "requires_payment_method";

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
  failed_payment_email_sent_at: string | null;
  failed_payment_email_last_status: string | null;
  failed_payment_email_event_id: string | null;
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
  failed_payment_email_sent_at: string | null;
  failed_payment_email_last_status: string | null;
  failed_payment_email_event_id: string | null;
  properties?: { address?: string | null } | { address?: string | null }[] | null;
};

type StatusChangeNotification = {
  billKind: "tenant" | "owner";
  propertyAddress: string;
  tenantName?: string | null;
  contactName?: string | null;
  recipientEmails: string[];
  amount: number | null;
  description?: string | null;
  dueDate?: string | null;
  oldStatus: string | null;
  newStatus: StripeSyncStatus;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  connectedAccountId?: string | null;
  billId: string;
  paymentMethod: "ach" | "card" | "manual" | "online";
};

type FailedPaymentNotification = Omit<StatusChangeNotification, "newStatus"> & {
  failedStatus: FailedPaymentStatus;
  retryUrl: string;
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
const EMAIL_FOOTER = "Questions? Contact Luxor Developments at connect@luxordev.com.";

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

const mapPaymentIntentFailureStatus = (status: Stripe.PaymentIntent.Status): FailedPaymentStatus | null => {
  if (status === "canceled") return "canceled";
  if (status === "requires_payment_method") return "requires_payment_method";
  return null;
};

const getCheckoutSessionFailureStatus = (eventType: string): FailedPaymentStatus | null => {
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  if (eventType === "checkout.session.expired") return "expired";
  return null;
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
  if (eventType === "checkout.session.expired") {
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

const getLeaseTenantContacts = async (leaseAgreementId: string | null) => {
  if (!leaseAgreementId) {
    return { names: [] as string[], emails: [] as string[] };
  }

  const { data: tenantLinks, error } = await supabaseAdmin
    .from("lease_agreement_tenants")
    .select("user_id")
    .eq("lease_agreement_id", leaseAgreementId);

  if (error) throw error;

  const tenantUserIds = ((tenantLinks || []) as { user_id?: string | null }[])
    .map((row) => row.user_id)
    .filter((value): value is string => Boolean(value));
  const userInfoMap = await getUserInfoMap(tenantUserIds);
  const names = Array.from(userInfoMap.values())
    .map((entry) => entry.name)
    .filter((value): value is string => Boolean(value));
  const emails = Array.from(userInfoMap.values())
    .map((entry) => entry.email)
    .filter((value): value is string => Boolean(value));

  return { names, emails };
};

const getPropertyOwnerContacts = async (propertyId: string) => {
  const normalizedPropertyId = String(propertyId || "").trim();
  if (!normalizedPropertyId) {
    return { names: [] as string[], emails: [] as string[] };
  }

  const { data: ownerLinks, error } = await supabaseAdmin
    .from("user_properties")
    .select("user_id")
    .eq("property_id", normalizedPropertyId)
    .eq("role", "owner");

  if (error) throw error;

  const ownerUserIds = ((ownerLinks || []) as { user_id?: string | null }[])
    .map((row) => row.user_id)
    .filter((value): value is string => Boolean(value));
  const userInfoMap = await getUserInfoMap(ownerUserIds);
  const names = Array.from(userInfoMap.values())
    .map((entry) => entry.name)
    .filter((value): value is string => Boolean(value));
  const emails = Array.from(userInfoMap.values())
    .map((entry) => entry.email)
    .filter((value): value is string => Boolean(value));

  return {
    names: Array.from(new Set(names)),
    emails: Array.from(new Set(emails)),
  };
};

const formatCurrency = (amount: number | null) =>
  amount != null ? `$${Number(amount).toFixed(2)}` : "N/A";

const getFirstName = (name?: string | null, fallbackEmail?: string | null) => {
  const normalized = String(name || "").trim();
  if (normalized) return normalized.split(/\s+/)[0];
  const email = String(fallbackEmail || "").trim();
  return email ? email.split("@")[0] : "there";
};

const getPaymentMethodLabel = (paymentMethod: StatusChangeNotification["paymentMethod"]) => {
  if (paymentMethod === "ach") return "Bank Transfer (ACH)";
  if (paymentMethod === "card") return "Credit Card";
  if (paymentMethod === "manual") return "Zelle / Other";
  return "Online Payment";
};

const getPortalPath = (billKind: StatusChangeNotification["billKind"]) =>
  billKind === "owner" ? "/owner/billing" : "/tenant/payments";

const buildCustomerPaymentEmail = (payload: StatusChangeNotification) => {
  const propertyShortName = getShortPropertyName(payload.propertyAddress);
  const amountLabel = formatCurrency(payload.amount);
  const paymentMethodLabel = getPaymentMethodLabel(payload.paymentMethod);
  const firstName = getFirstName(payload.contactName, payload.recipientEmails[0] || null);
  const subjectPrefix = payload.newStatus === "processing" ? "Payment Processing" : "Payment Confirmed";
  const subject = `${subjectPrefix} — ${propertyShortName} — ${amountLabel}`;
  const logoUrl = `${CANONICAL_PORTAL_URL}/luxor-logo.png`;
  const ctaUrl = `${CANONICAL_PORTAL_URL}${getPortalPath(payload.billKind)}`;
  const ctaLabel = payload.newStatus === "processing" ? "VIEW PAYMENT STATUS" : "VIEW PAYMENT DETAILS";
  const introTitle = payload.newStatus === "processing" ? "Payment Processing" : "Payment Confirmed";
  const introSubtitle =
    payload.newStatus === "processing"
      ? "We received your payment submission, and it is now processing."
      : payload.paymentMethod === "manual"
        ? "Your payment has been recorded and marked as paid."
        : "Your payment has been received and marked as paid.";
  const statusLabel = payload.newStatus === "processing" ? "Processing" : "Paid";

  const html = `
    <div style="background-color: #ffffff; padding: 0; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 0 20px 32px;">
        <div style="background-color: #0f172a; height: 8px;"></div>
        <div style="padding: 16px 0;">
          <img src="${logoUrl}" alt="Luxor Developments" style="height: 32px;" />
        </div>
        <h1 style="font-size: 24px; margin: 0 0 6px; color: #0f172a;">${introTitle}</h1>
        <h2 style="font-size: 18px; margin: 0 0 18px; color: #334155;">${introSubtitle}</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: #0f172a;">Hi ${firstName},</p>
        <a href="${ctaUrl}" style="display: block; text-align: center; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          ${ctaLabel}
        </a>
        <div style="margin: 22px 0 0;">
          <div style="border-left: 4px solid ${payload.newStatus === "processing" ? "#bfdbfe" : "#86efac"}; padding-left: 12px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: #ffffff;">
              <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">
                ${propertyShortName} — ${payload.propertyAddress || "Unknown property"}
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                <tbody>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Bill:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${payload.description || "Payment"}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Amount:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${amountLabel}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Status:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${statusLabel}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Payment Method:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${paymentMethodLabel}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ${
          payload.newStatus === "processing"
            ? '<p style="margin: 20px 0 0; font-size: 14px; color: #334155;">Bank transfers may take approximately 2–4 business days to be confirmed. No further action is needed at this time.</p>'
            : ""
        }
        <p style="margin: 20px 0 0; font-size: 14px; color: #334155;">Thank you,<br />Luxor Developments</p>
        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">${EMAIL_FOOTER}</p>
      </div>
    </div>
  `;

  const text = [
    introTitle,
    introSubtitle,
    "",
    `Hi ${firstName},`,
    "",
    `Property: ${propertyShortName} — ${payload.propertyAddress || "Unknown property"}`,
    `Bill: ${payload.description || "Payment"}`,
    `Amount: ${amountLabel}`,
    `Status: ${statusLabel}`,
    `Payment Method: ${paymentMethodLabel}`,
    payload.newStatus === "processing"
      ? "Bank transfers may take approximately 2–4 business days to be confirmed. No further action is needed at this time."
      : "",
    "",
    "Thank you,",
    "Luxor Developments",
    "",
    ctaLabel,
    ctaUrl,
    "",
    EMAIL_FOOTER,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
};

const shouldSendCustomerPaymentEmail = (payload: StatusChangeNotification) => {
  if (payload.newStatus === "processing") {
    return payload.paymentMethod === "ach";
  }
  if (payload.newStatus === "paid") {
    return payload.paymentMethod === "card" || payload.paymentMethod === "manual" || payload.paymentMethod === "online";
  }
  return false;
};

const sendCustomerPaymentStatusEmail = async (payload: StatusChangeNotification) => {
  if (!shouldSendCustomerPaymentEmail(payload)) {
    return;
  }

  const transport = createTransport();
  if (!transport) {
    console.warn("Skipping customer payment status email; SMTP configuration missing.", {
      billKind: payload.billKind,
      billId: payload.billId,
      newStatus: payload.newStatus,
    });
    return;
  }

  const recipientEmails = Array.from(new Set(payload.recipientEmails.filter(Boolean)));
  if (!recipientEmails.length) {
    console.warn("Skipping customer payment status email; recipient email missing.", {
      billKind: payload.billKind,
      billId: payload.billId,
      newStatus: payload.newStatus,
    });
    return;
  }

  const emailContent = buildCustomerPaymentEmail({
    ...payload,
    recipientEmails,
  });

  await transport.transporter.sendMail({
    from: transport.from,
    to: recipientEmails,
    cc: INTERNAL_PAYMENT_EMAIL,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });
};

const buildFailedPaymentEmail = (payload: FailedPaymentNotification) => {
  const propertyShortName = getShortPropertyName(payload.propertyAddress);
  const amountLabel = formatCurrency(payload.amount);
  const paymentMethodLabel = getPaymentMethodLabel(payload.paymentMethod);
  const firstName = getFirstName(payload.contactName, payload.recipientEmails[0] || null);
  const subject = "Payment Could Not Be Completed";
  const logoUrl = `${CANONICAL_PORTAL_URL}/luxor-logo.png`;
  const ctaLabel = "REVIEW PAYMENT";
  const billLabel = payload.description || "Payment";
  const statusLabel =
    payload.failedStatus === "expired"
      ? "Expired"
      : payload.failedStatus === "canceled"
        ? "Canceled"
        : "Failed";

  const html = `
    <div style="background-color: #ffffff; padding: 0; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 0 20px 32px;">
        <div style="background-color: #0f172a; height: 8px;"></div>
        <div style="padding: 16px 0;">
          <img src="${logoUrl}" alt="Luxor Developments" style="height: 32px;" />
        </div>
        <h1 style="font-size: 24px; margin: 0 0 6px; color: #0f172a;">${subject}</h1>
        <h2 style="font-size: 18px; margin: 0 0 18px; color: #334155;">Please review your payment method or submit payment again.</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: #0f172a;">Hi ${firstName},</p>
        <a href="${payload.retryUrl}" style="display: block; text-align: center; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          ${ctaLabel}
        </a>
        <div style="margin: 22px 0 0;">
          <div style="border-left: 4px solid #fecaca; padding-left: 12px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: #ffffff;">
              <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">
                ${propertyShortName} - ${payload.propertyAddress || "Unknown property"}
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                <tbody>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Bill:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${billLabel}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Amount:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${amountLabel}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Status:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${statusLabel}</td></tr>
                  <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 130px; vertical-align: top;">Payment Method:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${paymentMethodLabel}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p style="margin: 20px 0 0; font-size: 14px; color: #334155;">Your account has not been credited for this payment attempt.</p>
        <p style="margin: 20px 0 0; font-size: 14px; color: #334155;">Thank you,<br />Luxor Developments</p>
        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">${EMAIL_FOOTER}</p>
      </div>
    </div>
  `;

  const text = [
    subject,
    "Please review your payment method or submit payment again.",
    "",
    `Hi ${firstName},`,
    "",
    `Property: ${propertyShortName} - ${payload.propertyAddress || "Unknown property"}`,
    `Bill: ${billLabel}`,
    `Amount: ${amountLabel}`,
    `Status: ${statusLabel}`,
    `Payment Method: ${paymentMethodLabel}`,
    "",
    "Your account has not been credited for this payment attempt.",
    "",
    ctaLabel,
    payload.retryUrl,
    "",
    "Thank you,",
    "Luxor Developments",
    "",
    EMAIL_FOOTER,
  ].join("\n");

  return { subject, html, text };
};

const sendFailedPaymentEmail = async (payload: FailedPaymentNotification) => {
  const transport = createTransport();
  if (!transport) {
    console.warn("Skipping failed payment email; SMTP configuration missing.", {
      billKind: payload.billKind,
      billId: payload.billId,
      failedStatus: payload.failedStatus,
    });
    return false;
  }

  const recipientEmails = Array.from(new Set(payload.recipientEmails.filter(Boolean)));
  if (!recipientEmails.length) {
    console.warn("Skipping failed payment email; recipient email missing.", {
      billKind: payload.billKind,
      billId: payload.billId,
      failedStatus: payload.failedStatus,
    });
    return false;
  }

  const emailContent = buildFailedPaymentEmail({
    ...payload,
    recipientEmails,
  });

  await transport.transporter.sendMail({
    from: transport.from,
    to: recipientEmails,
    cc: INTERNAL_PAYMENT_EMAIL,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  return true;
};

const getFailedPaymentKey = (input: {
  eventId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  failedStatus: FailedPaymentStatus;
  billId: string;
}) =>
  input.eventId ||
  input.stripePaymentIntentId ||
  input.stripeSessionId ||
  `${input.billId}:${input.failedStatus}`;

const wasFailedPaymentEmailSent = (
  row: Pick<TenantBillRow | OwnerInvoiceRow, "failed_payment_email_event_id" | "failed_payment_email_last_status">,
  failedStatus: FailedPaymentStatus,
  failedPaymentKey: string
) => row.failed_payment_email_event_id === failedPaymentKey && row.failed_payment_email_last_status === failedStatus;

const markFailedPaymentEmailSent = async (input: {
  billKind: StatusChangeNotification["billKind"];
  billId: string;
  failedStatus: FailedPaymentStatus;
  failedPaymentKey: string;
}) => {
  const table = input.billKind === "tenant" ? "tenant_bills" : "billing_invoices";
  const { error } = await supabaseAdmin
    .from(table)
    .update({
      failed_payment_email_sent_at: new Date().toISOString(),
      failed_payment_email_last_status: input.failedStatus,
      failed_payment_email_event_id: input.failedPaymentKey,
    })
    .eq("id", input.billId);
  if (error) throw error;
};

const shouldSendLandlordTenantPaymentEmail = (payload: StatusChangeNotification) => {
  if (payload.billKind !== "tenant") return false;
  if (payload.newStatus === "processing") return payload.paymentMethod === "ach";
  if (payload.newStatus === "paid") {
    return payload.paymentMethod === "card" || payload.paymentMethod === "manual" || payload.paymentMethod === "online";
  }
  return false;
};

const buildLandlordTenantPaymentEmail = (payload: StatusChangeNotification) => {
  const propertyShortName = getShortPropertyName(payload.propertyAddress);
  const amountLabel = formatCurrency(payload.amount);
  const paymentMethodLabel = getPaymentMethodLabel(payload.paymentMethod);
  const statusLabel = payload.newStatus === "processing" ? "Processing" : "Paid";
  const tenantLabel = payload.tenantName || "Tenant";
  const billLabel = payload.description || "Payment";
  const propertyLabel = `${propertyShortName} - ${payload.propertyAddress || "Unknown property"}`;
  const logoUrl = `${CANONICAL_PORTAL_URL}/luxor-logo.png`;

  let subject = "Tenant Payment Confirmed";
  let intro = "A tenant payment has been successfully received and confirmed.";
  let detail = "The tenant's account has been updated accordingly.";
  let payoutNote =
    "Stripe releases card payment funds according to the connected account's payout schedule. Actual deposit timing depends on the owner's Stripe payout settings and receiving bank.";

  if (payload.newStatus === "processing" && payload.paymentMethod === "ach") {
    subject = "Tenant Payment Received - Processing";
    intro = "A tenant payment has been received and is currently processing.";
    detail = "ACH payments typically take approximately 2-4 business days to be confirmed.";
    payoutNote =
      "After ACH settlement, Stripe releases funds according to the connected account's payout schedule. Actual deposit timing depends on the owner's Stripe payout settings and receiving bank.";
  } else if (payload.newStatus === "paid" && payload.paymentMethod === "manual") {
    subject = "Tenant Payment Recorded";
    intro = "A tenant payment has been recorded and marked as paid.";
    detail =
      "This payment was made outside Stripe and has been applied to the tenant's account based on payment confirmation received.";
    payoutNote =
      "No Stripe processing or payout applies. Fund availability depends on the external payment method and the receiving financial institution.";
  } else if (payload.newStatus === "paid" && payload.paymentMethod === "online") {
    payoutNote =
      "Stripe releases online payment funds according to the connected account's payout schedule. Actual deposit timing depends on the owner's Stripe payout settings and receiving bank.";
  }

  const summaryRows = `
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Property:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${propertyLabel}</td></tr>
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Tenant:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${tenantLabel}</td></tr>
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Bill:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${billLabel}</td></tr>
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Amount:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${amountLabel}</td></tr>
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Status:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${statusLabel}</td></tr>
    <tr><td style="padding: 4px 0; color: #475569; font-size: 14px; width: 140px; vertical-align: top;">Payment Method:</td><td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${paymentMethodLabel}</td></tr>
  `;

  const html = `
    <div style="background-color: #ffffff; padding: 0; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 0 20px 32px;">
        <div style="background-color: #0f172a; height: 8px;"></div>
        <div style="padding: 16px 0;">
          <img src="${logoUrl}" alt="Luxor Developments" style="height: 32px;" />
        </div>
        <h1 style="font-size: 24px; margin: 0 0 6px; color: #0f172a;">${subject}</h1>
        <p style="margin: 0 0 20px; font-size: 14px; color: #0f172a;">Hello,</p>
        <p style="margin: 0 0 18px; font-size: 14px; color: #334155;">${intro}</p>
        <div style="border-left: 4px solid ${payload.newStatus === "processing" ? "#bfdbfe" : "#86efac"}; padding-left: 12px; margin: 0 0 20px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #ffffff;">
            <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">Payment Summary</div>
            <table style="width: 100%; border-collapse: collapse;"><tbody>${summaryRows}</tbody></table>
          </div>
        </div>
        <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">${detail}</p>
        <p style="margin: 0 0 6px; font-size: 14px; color: #0f172a; font-weight: 600;">Payout Note:</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #334155;">${payoutNote}</p>
        <p style="margin: 20px 0 0; font-size: 14px; color: #334155;">Thank you,<br />Luxor Property Management</p>
        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">${EMAIL_FOOTER}</p>
      </div>
    </div>
  `;

  const text = [
    subject,
    "",
    "Hello,",
    "",
    intro,
    "",
    `Property: ${propertyLabel}`,
    `Tenant: ${tenantLabel}`,
    `Bill: ${billLabel}`,
    `Amount: ${amountLabel}`,
    `Status: ${statusLabel}`,
    `Payment Method: ${paymentMethodLabel}`,
    "",
    detail,
    "",
    "Payout Note:",
    payoutNote,
    "",
    "Thank you,",
    "Luxor Property Management",
    "",
    EMAIL_FOOTER,
  ].join("\n");

  return { subject, html, text };
};

const sendLandlordTenantPaymentStatusEmail = async (payload: StatusChangeNotification) => {
  if (!shouldSendLandlordTenantPaymentEmail(payload)) {
    return;
  }

  const transport = createTransport();
  if (!transport) {
    console.warn("Skipping landlord tenant payment email; SMTP configuration missing.", {
      billId: payload.billId,
      newStatus: payload.newStatus,
    });
    return;
  }

  const recipientEmails = Array.from(new Set(payload.recipientEmails.filter(Boolean)));
  if (!recipientEmails.length) {
    console.warn("Skipping landlord tenant payment email; owner recipient email missing.", {
      billId: payload.billId,
      propertyAddress: payload.propertyAddress,
      newStatus: payload.newStatus,
    });
    return;
  }

  const emailContent = buildLandlordTenantPaymentEmail({
    ...payload,
    recipientEmails,
  });

  await transport.transporter.sendMail({
    from: transport.from,
    to: recipientEmails,
    cc: INTERNAL_PAYMENT_EMAIL,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });
};

const getStripePaymentMethodCategory = (input: {
  sessionPaymentMethodTypes?: string[] | null;
  paymentIntentPaymentMethodTypes?: string[] | null;
  paymentLinkUrl?: string | null;
}): StatusChangeNotification["paymentMethod"] => {
  const methodTypes = [
    ...(input.sessionPaymentMethodTypes || []),
    ...(input.paymentIntentPaymentMethodTypes || []),
  ].map((value) => String(value || "").trim().toLowerCase());

  if (methodTypes.includes("us_bank_account")) return "ach";
  if (methodTypes.includes("card")) return "card";
  if (input.paymentLinkUrl) return "online";
  return "manual";
};

const updateTenantBillStatus = async (bill: TenantBillRow, nextStatus: StripeSyncStatus, context: {
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  connectedAccountId: string | null;
  paymentMethod: StatusChangeNotification["paymentMethod"];
  failedStatus?: FailedPaymentStatus | null;
  eventId?: string | null;
}) => {
  const currentStatus = normalizeStatus(bill.status);
  if (currentStatus === "paid") {
    return { id: bill.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }
  if (currentStatus === nextStatus && !(nextStatus === "due" && context.failedStatus)) {
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
  let recipientEmails: string[] = [];
  if (bill.tenant_id) {
    const userInfoMap = await getUserInfoMap([bill.tenant_id]);
    const info = userInfoMap.get(bill.tenant_id);
    contactName = info?.name || null;
    recipientEmails = info?.email ? [info.email] : [];
  } else {
    const leaseContact = await getLeaseTenantContacts(bill.lease_agreement_id);
    contactName = leaseContact.names[0] || null;
    recipientEmails = leaseContact.emails;
  }

  const tenantName = contactName || recipientEmails[0] || null;
  await sendCustomerPaymentStatusEmail({
    billKind: "tenant",
    billId: bill.id,
    propertyAddress: getPropertyAddress(bill.properties),
    tenantName,
    contactName,
    recipientEmails,
    amount: bill.amount,
    description: bill.description || bill.bill_type,
    dueDate: bill.due_date,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    stripeSessionId: context.stripeSessionId,
    stripePaymentIntentId: context.stripePaymentIntentId,
    connectedAccountId: context.connectedAccountId,
    paymentMethod: context.paymentMethod,
  });

  const ownerContacts = await getPropertyOwnerContacts(bill.property_id);
  await sendLandlordTenantPaymentStatusEmail({
    billKind: "tenant",
    billId: bill.id,
    propertyAddress: getPropertyAddress(bill.properties),
    tenantName,
    contactName: ownerContacts.names[0] || null,
    recipientEmails: ownerContacts.emails,
    amount: bill.amount,
    description: bill.description || bill.bill_type,
    dueDate: bill.due_date,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    stripeSessionId: context.stripeSessionId,
    stripePaymentIntentId: context.stripePaymentIntentId,
    connectedAccountId: context.connectedAccountId,
    paymentMethod: context.paymentMethod,
  });

  if (nextStatus === "due" && context.failedStatus) {
    const failedPaymentKey = getFailedPaymentKey({
      eventId: context.eventId,
      stripePaymentIntentId: context.stripePaymentIntentId,
      stripeSessionId: context.stripeSessionId,
      failedStatus: context.failedStatus,
      billId: bill.id,
    });
    if (!wasFailedPaymentEmailSent(bill, context.failedStatus, failedPaymentKey)) {
      const sent = await sendFailedPaymentEmail({
        billKind: "tenant",
        billId: bill.id,
        propertyAddress: getPropertyAddress(bill.properties),
        contactName,
        recipientEmails,
        amount: bill.amount,
        description: bill.description || bill.bill_type,
        dueDate: bill.due_date,
        oldStatus: currentStatus,
        failedStatus: context.failedStatus,
        stripeSessionId: context.stripeSessionId,
        stripePaymentIntentId: context.stripePaymentIntentId,
        connectedAccountId: context.connectedAccountId,
        paymentMethod: context.paymentMethod,
        retryUrl: `${CANONICAL_PORTAL_URL}/tenant/payments`,
      });
      if (sent) {
        await markFailedPaymentEmailSent({
          billKind: "tenant",
          billId: bill.id,
          failedStatus: context.failedStatus,
          failedPaymentKey,
        });
      }
    }
  }

  return { id: bill.id, changed: true, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
};

const updateOwnerInvoiceStatus = async (invoice: OwnerInvoiceRow, nextStatus: StripeSyncStatus, context: {
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  paymentMethod: StatusChangeNotification["paymentMethod"];
  failedStatus?: FailedPaymentStatus | null;
  eventId?: string | null;
}) => {
  const currentStatus = normalizeStatus(invoice.status);
  if (currentStatus === "paid") {
    return { id: invoice.id, changed: false, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
  }
  if (currentStatus === nextStatus && !(nextStatus === "due" && context.failedStatus)) {
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
  let recipientEmails: string[] = [];
  if (invoice.owner_id) {
    const userInfoMap = await getUserInfoMap([invoice.owner_id]);
    const info = userInfoMap.get(invoice.owner_id);
    contactName = info?.name || null;
    recipientEmails = info?.email ? [info.email] : [];
  }

  await sendCustomerPaymentStatusEmail({
    billKind: "owner",
    billId: invoice.id,
    propertyAddress: getPropertyAddress(invoice.properties),
    contactName,
    recipientEmails,
    amount: invoice.total_due ?? invoice.fee_amount,
    description: invoice.description || invoice.category,
    dueDate: invoice.due_date,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    stripeSessionId: context.stripeSessionId,
    stripePaymentIntentId: context.stripePaymentIntentId,
    connectedAccountId: null,
    paymentMethod: context.paymentMethod,
  });

  if (nextStatus === "due" && context.failedStatus) {
    const failedPaymentKey = getFailedPaymentKey({
      eventId: context.eventId,
      stripePaymentIntentId: context.stripePaymentIntentId,
      stripeSessionId: context.stripeSessionId,
      failedStatus: context.failedStatus,
      billId: invoice.id,
    });
    if (!wasFailedPaymentEmailSent(invoice, context.failedStatus, failedPaymentKey)) {
      const sent = await sendFailedPaymentEmail({
        billKind: "owner",
        billId: invoice.id,
        propertyAddress: getPropertyAddress(invoice.properties),
        contactName,
        recipientEmails,
        amount: invoice.total_due ?? invoice.fee_amount,
        description: invoice.description || invoice.category,
        dueDate: invoice.due_date,
        oldStatus: currentStatus,
        failedStatus: context.failedStatus,
        stripeSessionId: context.stripeSessionId,
        stripePaymentIntentId: context.stripePaymentIntentId,
        connectedAccountId: null,
        paymentMethod: context.paymentMethod,
        retryUrl: `${CANONICAL_PORTAL_URL}/owner/billing`,
      });
      if (sent) {
        await markFailedPaymentEmailSent({
          billKind: "owner",
          billId: invoice.id,
          failedStatus: context.failedStatus,
          failedPaymentKey,
        });
      }
    }
  }

  return { id: invoice.id, changed: true, oldStatus: currentStatus, newStatus: nextStatus } satisfies RefreshResult;
};

export const syncTenantBillsFromCheckoutSession = async (
  session: Stripe.Checkout.Session,
  eventType: string,
  eventId?: string | null
) => {
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
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .in("id", tenantBillIds);

  if (error) throw error;

  const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const paymentMethod = getStripePaymentMethodCategory({
    sessionPaymentMethodTypes: session.payment_method_types || null,
    paymentLinkUrl: null,
  });
  const failedStatus = getCheckoutSessionFailureStatus(eventType);
  let updated = 0;
  for (const bill of (data || []) as TenantBillRow[]) {
    const routing = await resolveTenantBillConnectedAccount(bill.property_id);
    const result = await updateTenantBillStatus(bill, nextStatus, {
      stripeSessionId: session.id,
      stripePaymentIntentId: currentPaymentIntentId,
      connectedAccountId: routing.connectedAccountId,
      paymentMethod,
      failedStatus,
      eventId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: tenantBillIds.length - updated };
};

export const syncOwnerInvoicesFromCheckoutSession = async (
  session: Stripe.Checkout.Session,
  eventType: string,
  eventId?: string | null
) => {
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
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .in("id", invoiceIds);

  if (error) throw error;

  const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const paymentMethod = getStripePaymentMethodCategory({
    sessionPaymentMethodTypes: session.payment_method_types || null,
    paymentLinkUrl: null,
  });
  const failedStatus = getCheckoutSessionFailureStatus(eventType);
  let updated = 0;
  for (const invoice of (data || []) as OwnerInvoiceRow[]) {
    const result = await updateOwnerInvoiceStatus(invoice, nextStatus, {
      stripeSessionId: session.id,
      stripePaymentIntentId: currentPaymentIntentId,
      paymentMethod,
      failedStatus,
      eventId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: invoiceIds.length - updated };
};

export const syncTenantBillsFromPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
  eventType: string,
  eventId?: string | null,
  connectedAccountId?: string | null
) => {
  const failedStatus =
    eventType === "payment_intent.payment_failed" ? "failed" : mapPaymentIntentFailureStatus(paymentIntent.status);
  if (!failedStatus) {
    return { updated: 0, skipped: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (error) throw error;

  const paymentMethod = getStripePaymentMethodCategory({
    paymentIntentPaymentMethodTypes: paymentIntent.payment_method_types,
  });
  let updated = 0;
  for (const bill of (data || []) as TenantBillRow[]) {
    const routing = connectedAccountId ? { connectedAccountId } : await resolveTenantBillConnectedAccount(bill.property_id);
    const result = await updateTenantBillStatus(bill, "due", {
      stripeSessionId: bill.stripe_session_id,
      stripePaymentIntentId: paymentIntent.id,
      connectedAccountId: routing.connectedAccountId,
      paymentMethod,
      failedStatus,
      eventId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: (data || []).length - updated };
};

export const syncOwnerInvoicesFromPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
  eventType: string,
  eventId?: string | null
) => {
  const failedStatus =
    eventType === "payment_intent.payment_failed" ? "failed" : mapPaymentIntentFailureStatus(paymentIntent.status);
  if (!failedStatus) {
    return { updated: 0, skipped: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (error) throw error;

  const paymentMethod = getStripePaymentMethodCategory({
    paymentIntentPaymentMethodTypes: paymentIntent.payment_method_types,
  });
  let updated = 0;
  for (const invoice of (data || []) as OwnerInvoiceRow[]) {
    const result = await updateOwnerInvoiceStatus(invoice, "due", {
      stripeSessionId: invoice.stripe_session_id,
      stripePaymentIntentId: paymentIntent.id,
      paymentMethod,
      failedStatus,
      eventId,
    });
    if (result.changed) updated += 1;
  }

  return { updated, skipped: (data || []).length - updated };
};

export const refreshTenantBillStripeStatus = async (billId: string) => {
  const { data, error } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
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
  let paymentMethod: StatusChangeNotification["paymentMethod"] = getStripePaymentMethodCategory({
    paymentLinkUrl: bill.payment_link_url,
  });
  let failedStatus: FailedPaymentStatus | null = null;

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
      failedStatus = mapPaymentIntentFailureStatus(paymentIntent.status);
      paymentMethod = getStripePaymentMethodCategory({
        paymentIntentPaymentMethodTypes: paymentIntent.payment_method_types,
        paymentLinkUrl: bill.payment_link_url,
      });
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
        failedStatus = mapPaymentIntentFailureStatus(session.payment_intent.status);
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentIntentPaymentMethodTypes: session.payment_intent.payment_method_types,
          paymentLinkUrl: bill.payment_link_url,
        });
      } else if (session.payment_status === "paid") {
        nextStatus = "paid";
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentLinkUrl: bill.payment_link_url,
        });
      } else if (session.status === "expired") {
        nextStatus = "due";
        failedStatus = "expired";
      } else {
        nextStatus = "processing";
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentLinkUrl: bill.payment_link_url,
        });
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
    paymentMethod,
    failedStatus,
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
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
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
  let paymentMethod: StatusChangeNotification["paymentMethod"] = getStripePaymentMethodCategory({
    paymentLinkUrl: invoice.payment_link_url,
  });
  let failedStatus: FailedPaymentStatus | null = null;

  if (invoice.stripe_payment_intent_id) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
      hasStripePayment = true;
      latestPaymentIntentId = paymentIntent.id;
      nextStatus = mapPaymentIntentStatus(paymentIntent.status);
      failedStatus = mapPaymentIntentFailureStatus(paymentIntent.status);
      paymentMethod = getStripePaymentMethodCategory({
        paymentIntentPaymentMethodTypes: paymentIntent.payment_method_types,
        paymentLinkUrl: invoice.payment_link_url,
      });
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
        failedStatus = mapPaymentIntentFailureStatus(session.payment_intent.status);
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentIntentPaymentMethodTypes: session.payment_intent.payment_method_types,
          paymentLinkUrl: invoice.payment_link_url,
        });
      } else if (session.payment_status === "paid") {
        nextStatus = "paid";
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentLinkUrl: invoice.payment_link_url,
        });
      } else if (session.status === "expired") {
        nextStatus = "due";
        failedStatus = "expired";
      } else {
        nextStatus = "processing";
        paymentMethod = getStripePaymentMethodCategory({
          sessionPaymentMethodTypes: session.payment_method_types || null,
          paymentLinkUrl: invoice.payment_link_url,
        });
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
    paymentMethod,
    failedStatus,
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

export const sendManualTenantBillPaidConfirmation = async (billId: string) => {
  const { data, error } = await supabaseAdmin
    .from("tenant_bills")
    .select("id, property_id, tenant_id, lease_agreement_id, status, amount, description, due_date, bill_type, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .eq("id", billId)
    .maybeSingle();
  if (error) throw error;
  const bill = data as TenantBillRow | null;
  if (!bill) return;

  let contactName: string | null = null;
  let recipientEmails: string[] = [];
  if (bill.tenant_id) {
    const userInfoMap = await getUserInfoMap([bill.tenant_id]);
    const info = userInfoMap.get(bill.tenant_id);
    contactName = info?.name || null;
    recipientEmails = info?.email ? [info.email] : [];
  } else {
    const leaseContact = await getLeaseTenantContacts(bill.lease_agreement_id);
    contactName = leaseContact.names[0] || null;
    recipientEmails = leaseContact.emails;
  }

  const tenantName = contactName || recipientEmails[0] || null;
  await sendCustomerPaymentStatusEmail({
    billKind: "tenant",
    billId: bill.id,
    propertyAddress: getPropertyAddress(bill.properties),
    tenantName,
    contactName,
    recipientEmails,
    amount: bill.amount,
    description: bill.description || bill.bill_type,
    dueDate: bill.due_date,
    oldStatus: bill.status,
    newStatus: "paid",
    stripeSessionId: bill.stripe_session_id,
    stripePaymentIntentId: bill.stripe_payment_intent_id,
    connectedAccountId: null,
    paymentMethod: "manual",
  });

  const ownerContacts = await getPropertyOwnerContacts(bill.property_id);
  await sendLandlordTenantPaymentStatusEmail({
    billKind: "tenant",
    billId: bill.id,
    propertyAddress: getPropertyAddress(bill.properties),
    tenantName,
    contactName: ownerContacts.names[0] || null,
    recipientEmails: ownerContacts.emails,
    amount: bill.amount,
    description: bill.description || bill.bill_type,
    dueDate: bill.due_date,
    oldStatus: bill.status,
    newStatus: "paid",
    stripeSessionId: bill.stripe_session_id,
    stripePaymentIntentId: bill.stripe_payment_intent_id,
    connectedAccountId: null,
    paymentMethod: "manual",
  });
};

export const sendManualOwnerInvoicePaidConfirmation = async (invoiceId: string) => {
  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, owner_id, property_id, status, total_due, fee_amount, description, due_date, category, stripe_session_id, stripe_payment_intent_id, processing_started_at, payment_link_url, failed_payment_email_sent_at, failed_payment_email_last_status, failed_payment_email_event_id, properties(address)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  const invoice = data as OwnerInvoiceRow | null;
  if (!invoice) return;

  let contactName: string | null = null;
  let recipientEmails: string[] = [];
  if (invoice.owner_id) {
    const userInfoMap = await getUserInfoMap([invoice.owner_id]);
    const info = userInfoMap.get(invoice.owner_id);
    contactName = info?.name || null;
    recipientEmails = info?.email ? [info.email] : [];
  }

  await sendCustomerPaymentStatusEmail({
    billKind: "owner",
    billId: invoice.id,
    propertyAddress: getPropertyAddress(invoice.properties),
    contactName,
    recipientEmails,
    amount: invoice.total_due ?? invoice.fee_amount,
    description: invoice.description || invoice.category,
    dueDate: invoice.due_date,
    oldStatus: invoice.status,
    newStatus: "paid",
    stripeSessionId: invoice.stripe_session_id,
    stripePaymentIntentId: invoice.stripe_payment_intent_id,
    connectedAccountId: null,
    paymentMethod: "manual",
  });
};
