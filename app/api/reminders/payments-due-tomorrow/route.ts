import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import {
  buildPaymentsDueTomorrowEmail,
  ReminderBill,
  ReminderRecipientType,
} from "@/lib/email/payments-due-soon";
import { formatDateOnly } from "@/lib/date-only";

const REMINDER_TYPE = "payments_due_tomorrow";

const getTomorrow = () => {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const iso = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(
    tomorrow.getUTCDate()
  ).padStart(2, "0")}`;
  return { iso, label: formatDateOnly(iso) || iso };
};

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

const getUserMap = async (ids: string[]) => {
  const unique = Array.from(new Set(ids));
  const entries = await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      if (error || !data?.user) return [id, null] as const;
      return [
        id,
        {
          email: data.user.email || null,
          name: (data.user.user_metadata as any)?.name || null,
        },
      ] as const;
    })
  );
  return new Map(entries);
};

const logReminder = async (payload: {
  recipientEmail: string;
  recipientType: ReminderRecipientType;
  targetMonth: string;
  billIds: string[];
  status: "sent" | "failed";
  providerMessageId?: string | null;
  error?: string | null;
}) => {
  await supabaseAdmin.from("email_reminders").insert({
    recipient_email: payload.recipientEmail,
    recipient_type: payload.recipientType,
    target_month: payload.targetMonth,
    reminder_type: REMINDER_TYPE,
    bill_ids: payload.billIds,
    status: payload.status,
    provider_message_id: payload.providerMessageId || null,
    error: payload.error || null,
  });
};

const alreadySent = async (recipientEmail: string, targetMonth: string) => {
  const { data, error } = await supabaseAdmin
    .from("email_reminders")
    .select("id")
    .eq("recipient_email", recipientEmail)
    .eq("target_month", targetMonth)
    .eq("reminder_type", REMINDER_TYPE)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
};

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isCronAuthorized = !!cronSecret && headerSecret === cronSecret;

  if (headerSecret && !isCronAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCronAuthorized) {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  const baseUrl = process.env.APP_BASE_URL || "";
  if (!baseUrl) {
    return NextResponse.json({ error: "APP_BASE_URL is required" }, { status: 500 });
  }

  const transport = createTransport();
  if (!transport) {
    return NextResponse.json({ error: "SMTP configuration missing" }, { status: 500 });
  }

  const { iso: tomorrowIso, label: tomorrowLabel } = getTomorrow();
  const targetMonth = tomorrowIso;

  const { data: ownerBills, error: ownerError } = await supabaseAdmin
    .from("billing_invoices")
    .select(
      `id, owner_id, property_id, total_due, fee_amount, base_rent, description, due_date, status, category, invoice_number, properties ( address )`
    )
    .eq("due_date", tomorrowIso)
    .neq("status", "paid")
    .neq("status", "processing")
    .neq("status", "voided");

  if (ownerError) {
    return NextResponse.json({ error: ownerError.message }, { status: 500 });
  }

  const { data: tenantBills, error: tenantError } = await supabaseAdmin
    .from("tenant_bills")
    .select(
      `id, tenant_id, property_id, bill_type, description, amount, due_date, status, properties ( address )`
    )
    .eq("due_date", tomorrowIso)
    .neq("status", "paid")
    .neq("status", "processing")
    .neq("status", "voided");

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }

  const ownerIds = (ownerBills || []).map((b: any) => b.owner_id).filter(Boolean);
  const tenantIds = (tenantBills || []).map((b: any) => b.tenant_id).filter(Boolean);
  const userMap = await getUserMap([...ownerIds, ...tenantIds]);

  const grouped: Record<
    string,
    { recipientType: ReminderRecipientType; name?: string | null; bills: ReminderBill[] }
  > = {};

  (ownerBills || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.owner_id);
    const email = userInfo?.email;
    if (!email) return;
    const key = `owner:${email}`;
    if (!grouped[key]) {
      grouped[key] = { recipientType: "owner", name: userInfo?.name, bills: [] };
    }
    grouped[key].bills.push({
      id: bill.id,
      amount: bill.total_due ?? bill.fee_amount ?? bill.base_rent,
      dueDate: bill.due_date,
      type: bill.category || "Bill",
      billTypeLabel: bill.category || "Bill",
      propertyAddress: bill.properties?.address || "",
      reference: bill.invoice_number || bill.id,
      notes: bill.description || "",
    });
  });

  (tenantBills || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.tenant_id);
    const email = userInfo?.email;
    if (!email) return;
    const key = `tenant:${email}`;
    if (!grouped[key]) {
      grouped[key] = { recipientType: "tenant", name: userInfo?.name, bills: [] };
    }
    grouped[key].bills.push({
      id: bill.id,
      amount: bill.amount,
      dueDate: bill.due_date,
      type: bill.bill_type || "Bill",
      billTypeLabel: bill.bill_type || "Bill",
      propertyAddress: bill.properties?.address || "",
      reference: bill.id,
      notes: bill.description || "",
    });
  });

  const results: any[] = [];

  for (const [key, group] of Object.entries(grouped)) {
    const email = key.split(":")[1];
    const already = await alreadySent(email, targetMonth);
    if (already) {
      results.push({ email, status: "skipped" });
      continue;
    }

    const emailPayload = buildPaymentsDueTomorrowEmail({
      recipientName: group.name,
      recipientType: group.recipientType,
      bills: group.bills,
      baseUrl,
      logoUrl: `${baseUrl.replace(/\/$/, "")}/luxor-logo.png`,
      dueDateLabel: tomorrowLabel,
    });

    try {
      const info = await transport.transporter.sendMail({
        from: transport.from,
        to: email,
        cc: "connect@luxordev.com",
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
      });
      await logReminder({
        recipientEmail: email,
        recipientType: group.recipientType,
        targetMonth,
        billIds: group.bills.map((b) => b.id || ""),
        status: "sent",
        providerMessageId: (info as any)?.messageId || null,
      });
      results.push({ email, status: "sent" });
    } catch (error: any) {
      await logReminder({
        recipientEmail: email,
        recipientType: group.recipientType,
        targetMonth,
        billIds: group.bills.map((b) => b.id || ""),
        status: "failed",
        error: error?.message || "Send failed",
      });
      results.push({ email, status: "failed", error: error?.message });
    }
  }

  return NextResponse.json({ targetMonth, results });
}
