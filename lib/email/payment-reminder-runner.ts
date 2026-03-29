import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import {
  buildPaymentReminderDigestEmail,
  ReminderBill,
  ReminderRecipientType,
  ReminderSectionKey,
  CANONICAL_PORTAL_URL,
} from "@/lib/email/payments-due-soon";
import { formatDateOnly } from "@/lib/date-only";

const DAILY_REMINDER_TYPE = "daily_payment_digest";
const CHECKPOINT_TYPES = {
  dueSoon: "bill_checkpoint_t5",
  dueTomorrow: "bill_checkpoint_t1",
  overdue: "bill_checkpoint_overdue",
} as const;

type ReminderGroup = {
  recipientType: ReminderRecipientType;
  name?: string | null;
  sections: Record<ReminderSectionKey, ReminderBill[]>;
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
  targetDay: string;
  reminderType: string;
  billIds: string[];
  status: "sent" | "failed";
  providerMessageId?: string | null;
  error?: string | null;
}) => {
  await supabaseAdmin.from("email_reminders").insert({
    recipient_email: payload.recipientEmail,
    recipient_type: payload.recipientType,
    target_month: payload.targetDay,
    reminder_type: payload.reminderType,
    bill_ids: payload.billIds,
    status: payload.status,
    provider_message_id: payload.providerMessageId || null,
    error: payload.error || null,
  });
};

const alreadySent = async (recipientEmail: string, targetDay: string, reminderType: string) => {
  const { data, error } = await supabaseAdmin
    .from("email_reminders")
    .select("id")
    .eq("recipient_email", recipientEmail)
    .eq("target_month", targetDay)
    .eq("reminder_type", reminderType)
    .eq("status", "sent")
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
};

const getBearerSecret = (request: Request) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
};

const addDaysIso = (days: number) => {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(
    target.getUTCDate()
  ).padStart(2, "0")}`;
};

const createEmptySections = (): Record<ReminderSectionKey, ReminderBill[]> => ({
  overdue: [],
  dueTomorrow: [],
  dueSoon: [],
});

const toOwnerBill = (bill: any): ReminderBill => ({
  id: bill.id,
  amount: bill.total_due ?? bill.fee_amount ?? bill.base_rent,
  dueDate: bill.due_date,
  type: bill.category || "Bill",
  billTypeLabel: bill.category || "Bill",
  propertyAddress: bill.properties?.address || "",
  notes: bill.description || "",
});

const toTenantBill = (bill: any): ReminderBill => ({
  id: bill.id,
  amount: bill.amount,
  dueDate: bill.due_date,
  type: bill.bill_type || "Bill",
  billTypeLabel: bill.bill_type || "Bill",
  propertyAddress: bill.properties?.address || "",
  notes: bill.description || "",
});

export async function runDailyPaymentReminder(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearerSecret = getBearerSecret(request);
  const providedSecret = headerSecret || bearerSecret;
  const isCronAuthorized = !!cronSecret && providedSecret === cronSecret;

  if (providedSecret && !isCronAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCronAuthorized) {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  const transport = createTransport();
  if (!transport) {
    return NextResponse.json({ error: "SMTP configuration missing" }, { status: 500 });
  }

  const todayIso = addDaysIso(0);
  const yesterdayIso = addDaysIso(-1);
  const tomorrowIso = addDaysIso(1);
  const dueSoonStartIso = addDaysIso(2);
  const dueSoonIso = addDaysIso(5);

  const [ownerOverdue, ownerTomorrow, ownerSoon, tenantOverdue, tenantTomorrow, tenantSoon] = await Promise.all([
    supabaseAdmin
      .from("billing_invoices")
      .select(
        "id, owner_id, property_id, total_due, fee_amount, base_rent, description, due_date, status, category, invoice_number, properties ( address )"
      )
      .lt("due_date", todayIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
    supabaseAdmin
      .from("billing_invoices")
      .select(
        "id, owner_id, property_id, total_due, fee_amount, base_rent, description, due_date, status, category, invoice_number, properties ( address )"
      )
      .eq("due_date", tomorrowIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
    supabaseAdmin
      .from("billing_invoices")
      .select(
        "id, owner_id, property_id, total_due, fee_amount, base_rent, description, due_date, status, category, invoice_number, properties ( address )"
      )
      .gte("due_date", dueSoonStartIso)
      .lte("due_date", dueSoonIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
    supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status, properties ( address )")
      .lt("due_date", todayIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
    supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status, properties ( address )")
      .eq("due_date", tomorrowIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
    supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status, properties ( address )")
      .gte("due_date", dueSoonStartIso)
      .lte("due_date", dueSoonIso)
      .neq("status", "paid")
      .neq("status", "processing")
      .neq("status", "in_progress")
      .neq("status", "voided"),
  ]);

  const queryErrors = [
    ownerOverdue.error,
    ownerTomorrow.error,
    ownerSoon.error,
    tenantOverdue.error,
    tenantTomorrow.error,
    tenantSoon.error,
  ].filter(Boolean);
  if (queryErrors.length) {
    return NextResponse.json({ error: queryErrors[0]?.message || "Failed to query reminder bills" }, { status: 500 });
  }

  const ownerIds = [
    ...(ownerOverdue.data || []).map((b: any) => b.owner_id),
    ...(ownerTomorrow.data || []).map((b: any) => b.owner_id),
    ...(ownerSoon.data || []).map((b: any) => b.owner_id),
  ].filter(Boolean);
  const tenantIds = [
    ...(tenantOverdue.data || []).map((b: any) => b.tenant_id),
    ...(tenantTomorrow.data || []).map((b: any) => b.tenant_id),
    ...(tenantSoon.data || []).map((b: any) => b.tenant_id),
  ].filter(Boolean);
  const userMap = await getUserMap([...ownerIds, ...tenantIds]);

  const grouped: Record<string, ReminderGroup> = {};
  const addBill = (
    recipientType: ReminderRecipientType,
    email: string,
    name: string | null | undefined,
    section: ReminderSectionKey,
    bill: ReminderBill
  ) => {
    const key = `${recipientType}:${email}`;
    if (!grouped[key]) {
      grouped[key] = {
        recipientType,
        name,
        sections: createEmptySections(),
      };
    }
    grouped[key].sections[section].push(bill);
  };

  (ownerOverdue.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.owner_id);
    if (userInfo?.email) addBill("owner", userInfo.email, userInfo.name, "overdue", toOwnerBill(bill));
  });
  (ownerTomorrow.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.owner_id);
    if (userInfo?.email) addBill("owner", userInfo.email, userInfo.name, "dueTomorrow", toOwnerBill(bill));
  });
  (ownerSoon.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.owner_id);
    if (userInfo?.email) addBill("owner", userInfo.email, userInfo.name, "dueSoon", toOwnerBill(bill));
  });
  (tenantOverdue.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.tenant_id);
    if (userInfo?.email) addBill("tenant", userInfo.email, userInfo.name, "overdue", toTenantBill(bill));
  });
  (tenantTomorrow.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.tenant_id);
    if (userInfo?.email) addBill("tenant", userInfo.email, userInfo.name, "dueTomorrow", toTenantBill(bill));
  });
  (tenantSoon.data || []).forEach((bill: any) => {
    const userInfo = userMap.get(bill.tenant_id);
    if (userInfo?.email) addBill("tenant", userInfo.email, userInfo.name, "dueSoon", toTenantBill(bill));
  });

  const checkpointCandidates = Object.entries(grouped).map(([key, group]) => {
    const email = key.split(":")[1];
    const newlyTriggered = [
      ...group.sections.overdue
        .filter((bill) => bill.dueDate === yesterdayIso)
        .map((bill) => ({
          reminderType: CHECKPOINT_TYPES.overdue,
          targetDay: `${todayIso}:${bill.id}`,
          billId: bill.id || "",
        })),
      ...group.sections.dueTomorrow
        .filter((bill) => bill.dueDate === tomorrowIso)
        .map((bill) => ({
          reminderType: CHECKPOINT_TYPES.dueTomorrow,
          targetDay: `${todayIso}:${bill.id}`,
          billId: bill.id || "",
        })),
      ...group.sections.dueSoon
        .filter((bill) => bill.dueDate === dueSoonIso)
        .map((bill) => ({
          reminderType: CHECKPOINT_TYPES.dueSoon,
          targetDay: `${todayIso}:${bill.id}`,
          billId: bill.id || "",
        })),
    ];

    return { email, group, newlyTriggered };
  });

  const checkpointTargetDays = checkpointCandidates.flatMap((entry) => entry.newlyTriggered.map((item) => item.targetDay));
  const checkpointEmails = checkpointCandidates.map((entry) => entry.email);
  const existingCheckpointSet = new Set<string>();

  if (checkpointTargetDays.length && checkpointEmails.length) {
    const { data: existingRows } = await supabaseAdmin
      .from("email_reminders")
      .select("recipient_email, reminder_type, target_month")
      .in("recipient_email", checkpointEmails)
      .in("target_month", checkpointTargetDays)
      .in("reminder_type", Object.values(CHECKPOINT_TYPES))
      .eq("status", "sent");

    (existingRows || []).forEach((row: any) => {
      existingCheckpointSet.add(`${row.recipient_email}|${row.reminder_type}|${row.target_month}`);
    });
  }

  const results: any[] = [];

  for (const { email, group, newlyTriggered } of checkpointCandidates) {
    const billIds = Object.values(group.sections)
      .flat()
      .map((bill) => bill.id || "")
      .filter(Boolean);
    if (!billIds.length) continue;

    const unsentTriggers = newlyTriggered.filter(
      (item) => !existingCheckpointSet.has(`${email}|${item.reminderType}|${item.targetDay}`)
    );
    if (!unsentTriggers.length) {
      results.push({ email, status: "skipped" });
      continue;
    }

    const already = await alreadySent(email, todayIso, DAILY_REMINDER_TYPE);
    if (already) {
      results.push({ email, status: "skipped" });
      continue;
    }

    const emailPayload = buildPaymentReminderDigestEmail({
      recipientName: group.name,
      recipientType: group.recipientType,
      sections: group.sections,
      logoUrl: `${CANONICAL_PORTAL_URL}/luxor-logo.png`,
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
        targetDay: todayIso,
        reminderType: DAILY_REMINDER_TYPE,
        billIds,
        status: "sent",
        providerMessageId: (info as any)?.messageId || null,
      });
      for (const trigger of unsentTriggers) {
        await logReminder({
          recipientEmail: email,
          recipientType: group.recipientType,
          targetDay: trigger.targetDay,
          reminderType: trigger.reminderType,
          billIds: [trigger.billId],
          status: "sent",
        });
      }
      results.push({
        email,
        status: "sent",
        overdue: group.sections.overdue.length,
        dueTomorrow: group.sections.dueTomorrow.length,
        dueSoon: group.sections.dueSoon.length,
      });
    } catch (error: any) {
      await logReminder({
        recipientEmail: email,
        recipientType: group.recipientType,
        targetDay: todayIso,
        reminderType: DAILY_REMINDER_TYPE,
        billIds,
        status: "failed",
        error: error?.message || "Send failed",
      });
      results.push({ email, status: "failed", error: error?.message });
    }
  }

  return NextResponse.json({
    targetDay: todayIso,
    labels: {
      overdueBefore: formatDateOnly(todayIso) || todayIso,
      dueTomorrow: formatDateOnly(tomorrowIso) || tomorrowIso,
      dueSoon: formatDateOnly(dueSoonIso) || dueSoonIso,
    },
    results,
  });
}
