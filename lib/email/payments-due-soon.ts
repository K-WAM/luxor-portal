import { formatDateOnly } from "@/lib/date-only";

export type ReminderRecipientType = "owner" | "tenant";
export type ReminderSectionKey = "overdue" | "dueTomorrow" | "dueSoon";

export type ReminderBill = {
  id?: string;
  amount?: number | string;
  dueDate?: string | null;
  type?: string | null;
  propertyName?: string | null;
  propertyAddress?: string | null;
  reference?: string | null;
  notes?: string | null;
  billTypeLabel?: string | null;
};

export type PaymentsDueSoonEmail = {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
};

export const CANONICAL_PORTAL_URL = "https://portal.luxordev.com";

const CTA_LABEL = "VIEW & PAY BILLS";
const FOOTER = "Questions? Contact Luxor Developments at connect@luxordev.com.";
const INTRO = "The following payment items require your attention:";
const BODY_2 = "If you have already scheduled your payment, please disregard this reminder.";

const SECTION_META: Record<
  ReminderSectionKey,
  { title: string; borderColor: string; badgeBg: string; badgeColor: string }
> = {
  overdue: {
    title: "Overdue",
    borderColor: "#fecaca",
    badgeBg: "#fef2f2",
    badgeColor: "#b91c1c",
  },
  dueTomorrow: {
    title: "Due Tomorrow",
    borderColor: "#fde68a",
    badgeBg: "#fffbeb",
    badgeColor: "#b45309",
  },
  dueSoon: {
    title: "Due Soon",
    borderColor: "#bfdbfe",
    badgeBg: "#eff6ff",
    badgeColor: "#1d4ed8",
  },
};

const toFirstName = (value?: string | null) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "there";
  const spaceIndex = trimmed.indexOf(" ");
  return spaceIndex > -1 ? trimmed.slice(0, spaceIndex) : trimmed;
};

const formatAmount = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
};

const buildPropertyHeading = (bill: ReminderBill) =>
  bill.propertyName || bill.propertyAddress || "Property";

const buildFieldRow = (label: string, value?: string | null) => {
  if (!value) return "";
  return `
    <tr>
      <td style="padding: 4px 0; color: #475569; font-size: 14px; width: 110px; vertical-align: top;">${label}</td>
      <td style="padding: 4px 0; color: #0f172a; font-size: 14px;">${value}</td>
    </tr>
  `;
};

const buildBillCard = (bill: ReminderBill) => {
  const amount = formatAmount(bill.amount) || "";
  const dueDate = bill.dueDate ? formatDateOnly(bill.dueDate) : "";
  return `
    <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: #ffffff;">
      <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">
        ${buildPropertyHeading(bill)}
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${buildFieldRow("Amount:", amount)}
          ${buildFieldRow("Due date:", dueDate)}
          ${buildFieldRow("Description:", bill.notes || "")}
        </tbody>
      </table>
    </div>
  `;
};

const buildSection = (key: ReminderSectionKey, bills: ReminderBill[]) => {
  if (!bills.length) return "";
  const meta = SECTION_META[key];
  return `
    <div style="margin: 22px 0 0;">
      <div style="margin: 0 0 12px;">
        <span style="display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${meta.badgeBg}; color: ${meta.badgeColor}; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;">
          ${meta.title}
        </span>
      </div>
      <div style="border-left: 4px solid ${meta.borderColor}; padding-left: 12px;">
        ${bills.map((bill) => buildBillCard(bill)).join("")}
      </div>
    </div>
  `;
};

export const buildPaymentReminderDigestEmail = (params: {
  recipientName?: string | null;
  recipientType: ReminderRecipientType;
  sections: Partial<Record<ReminderSectionKey, ReminderBill[]>>;
  logoUrl?: string | null;
}): PaymentsDueSoonEmail => {
  const firstName = toFirstName(params.recipientName);
  const greeting = `Hi ${firstName},`;
  const ctaUrl =
    params.recipientType === "owner"
      ? `${CANONICAL_PORTAL_URL}/owner/billing`
      : `${CANONICAL_PORTAL_URL}/tenant/payments`;

  const logoUrl = params.logoUrl || `${CANONICAL_PORTAL_URL}/luxor-logo.png`;
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="Luxor Developments" style="height: 32px;" />`
    : `<div style="font-size: 18px; font-weight: 600; color: #0f172a;">Luxor Developments</div>`;

  const orderedKeys: ReminderSectionKey[] = ["overdue", "dueTomorrow", "dueSoon"];
  const sectionHtml = orderedKeys
    .map((key) => buildSection(key, params.sections[key] || []))
    .join("");

  const textSections = orderedKeys.flatMap((key) => {
    const bills = params.sections[key] || [];
    if (!bills.length) return [];
    return [
      SECTION_META[key].title,
      ...bills.flatMap((bill) => {
        const lines = [buildPropertyHeading(bill)];
        const amount = formatAmount(bill.amount);
        if (amount) lines.push(`Amount: ${amount}`);
        if (bill.dueDate) lines.push(`Due date: ${formatDateOnly(bill.dueDate)}`);
        if (bill.notes) lines.push(`Description: ${bill.notes}`);
        lines.push("");
        return lines;
      }),
    ];
  });

  const html = `
    <div style="background-color: #ffffff; padding: 0; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 0 20px 32px;">
        <div style="background-color: #0f172a; height: 8px;"></div>
        <div style="padding: 16px 0;">${logoBlock}</div>
        <h1 style="font-size: 24px; margin: 0 0 6px; color: #0f172a;">Payment Reminder</h1>
        <h2 style="font-size: 18px; margin: 0 0 18px; color: #334155;">${INTRO}</h2>
        <p style="margin: 0 0 12px; font-size: 14px; color: #0f172a;">${greeting}</p>
        <p style="margin: 0 0 12px; font-size: 14px; color: #334155;">Please review the payment items below.</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #334155;">${BODY_2}</p>
        <a href="${ctaUrl}" style="display: block; text-align: center; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          ${CTA_LABEL}
        </a>
        ${sectionHtml}
        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">${FOOTER}</p>
      </div>
    </div>
  `;

  const text = [
    "Payment Reminder",
    INTRO,
    "",
    greeting,
    "Please review the payment items below.",
    BODY_2,
    "",
    CTA_LABEL,
    ctaUrl,
    "",
    ...textSections,
    FOOTER,
  ].join("\n");

  return {
    subject: "Action Required — Payment Reminder",
    html,
    text,
    ctaUrl,
  };
};
