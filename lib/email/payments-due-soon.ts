import { formatDateOnly } from "@/lib/date-only";

export type ReminderRecipientType = "owner" | "tenant";

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

const TITLE = "Just a Reminder…";
const SUBTITLE = "Payments are due soon.";
const BODY_1 =
  "You have upcoming payments due at the beginning of next month. Please schedule your payment as soon as possible to avoid delays or late fees.";
const BODY_2 =
  "If you have already scheduled your payment, please disregard this reminder.";
const CTA_LABEL = "SCHEDULE MY PAYMENT";
const BILL_INTRO =
  "Here are the payments currently due at the beginning of next month:";
const FOOTER =
  "Questions? Contact Luxor Developments at connect@luxordev.com.";

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

const formatMonthName = (dueDate?: string | null) => {
  if (!dueDate) return "Upcoming";
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "Upcoming";
  return date.toLocaleString("en-US", { month: "long" });
};

const buildBillTitle = (bill: ReminderBill) => {
  const monthName = formatMonthName(bill.dueDate);
  const billType = bill.billTypeLabel || bill.type || "Bill";
  const propertyDisplay = bill.propertyName || bill.propertyAddress || "Property";
  return `${monthName} ${billType} for ${propertyDisplay}`;
};

const buildFieldRow = (label: string, value?: string | null) => {
  if (!value) return "";
  return `
    <tr>
      <td style="padding: 2px 0; color: #334155; font-size: 14px; width: 110px;">${label}</td>
      <td style="padding: 2px 0; color: #0f172a; font-size: 14px;">${value}</td>
    </tr>
  `;
};

export const buildPaymentsDueSoonEmail = (params: {
  recipientName?: string | null;
  recipientType: ReminderRecipientType;
  bills: ReminderBill[];
  baseUrl: string;
  logoUrl?: string | null;
}): PaymentsDueSoonEmail => {
  const firstName = toFirstName(params.recipientName);
  const greeting = `Hi ${firstName},`;
  const ctaUrl =
    params.recipientType === "owner"
      ? `${params.baseUrl}/owner/billing`
      : `${params.baseUrl}/tenant/payments`;

  const logoBlock = params.logoUrl
    ? `<img src="${params.logoUrl}" alt="Luxor Developments" style="height: 32px;" />`
    : `<div style="font-size: 18px; font-weight: 600; color: #0f172a;">Luxor Developments</div>`;

  const billCards = params.bills
    .map((bill) => {
      const amount = formatAmount(bill.amount) || "";
      const dueDate = bill.dueDate ? formatDateOnly(bill.dueDate) : "";
      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 8px;">
            ${buildBillTitle(bill)}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              ${buildFieldRow("Amount:", amount)}
              ${buildFieldRow("Due date:", dueDate)}
              ${buildFieldRow("Type:", bill.billTypeLabel || bill.type || "")}
              ${buildFieldRow("Property:", bill.propertyName || "")}
              ${buildFieldRow("Address:", bill.propertyAddress || "")}
              ${buildFieldRow("Reference:", bill.reference || "")}
              ${buildFieldRow("Notes:", bill.notes || "")}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

  const html = `
    <div style="background-color: #ffffff; padding: 0; margin: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 0 20px 32px;">
        <div style="background-color: #0f172a; height: 8px;"></div>
        <div style="padding: 16px 0;">${logoBlock}</div>
        <h1 style="font-size: 24px; margin: 0 0 6px; color: #0f172a;">${TITLE}</h1>
        <h2 style="font-size: 18px; margin: 0 0 18px; color: #334155;">${SUBTITLE}</h2>
        <p style="margin: 0 0 10px; font-size: 14px; color: #0f172a;">${greeting}</p>
        <p style="margin: 0 0 12px; font-size: 14px; color: #334155;">${BODY_1}</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #334155;">${BODY_2}</p>
        <a href="${ctaUrl}" style="display: block; text-align: center; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          ${CTA_LABEL}
        </a>
        <p style="margin: 24px 0 12px; font-size: 14px; color: #334155;">${BILL_INTRO}</p>
        ${billCards}
        <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">${FOOTER}</p>
      </div>
    </div>
  `;

  const textLines = [
    TITLE,
    SUBTITLE,
    "",
    greeting,
    BODY_1,
    BODY_2,
    "",
    CTA_LABEL,
    ctaUrl,
    "",
    BILL_INTRO,
    ...params.bills.flatMap((bill) => {
      const lines = [buildBillTitle(bill)];
      const amount = formatAmount(bill.amount);
      if (amount) lines.push(`Amount: ${amount}`);
      if (bill.dueDate) lines.push(`Due date: ${formatDateOnly(bill.dueDate)}`);
      if (bill.billTypeLabel || bill.type) lines.push(`Type: ${bill.billTypeLabel || bill.type}`);
      if (bill.propertyName) lines.push(`Property: ${bill.propertyName}`);
      if (bill.propertyAddress) lines.push(`Address: ${bill.propertyAddress}`);
      if (bill.reference) lines.push(`Reference: ${bill.reference}`);
      if (bill.notes) lines.push(`Notes: ${bill.notes}`);
      lines.push("");
      return lines;
    }),
    FOOTER,
  ];

  return {
    subject: "Action Required — Payments Due Soon",
    html,
    text: textLines.join("\n"),
    ctaUrl,
  };
};
