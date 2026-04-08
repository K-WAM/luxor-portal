import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import {
  buildServicesInvoicePath,
  SERVICES_BILLING_SCOPE,
  SERVICES_PLATFORM_SCOPE,
} from "@/lib/services-billing";
import { toDateOnlyString } from "@/lib/date-only";
import crypto from "crypto";

const STORAGE_BUCKET = "property-documents";
const DAY_MS = 24 * 60 * 60 * 1000;
const SERVICES_PORTAL_BASE_URL = "https://portal.luxordev.com";

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const formatDateOnlyString = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00Z`);
  return formatDate(date);
};

const toCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const getHostedInvoiceUrl = (token: string) =>
  `${SERVICES_PORTAL_BASE_URL}${buildServicesInvoicePath(token)}`;

async function sendServicesInvoiceEmail(params: {
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  description: string;
  hostedInvoiceUrl: string;
}) {
  if (!params.clientEmail) return;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Luxor Services Invoice</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 28px 32px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0;">Hi ${params.clientName || "there"},</p>
        <p>Your new Luxor services invoice is ready.</p>
        <p><strong>Invoice number:</strong> ${params.invoiceNumber}</p>
        <p><strong>Amount:</strong> ${toCurrency(params.amount)}</p>
        <p><strong>Due date:</strong> ${formatDateOnlyString(params.dueDate)}</p>
        <p><strong>Description:</strong> ${params.description}</p>
        <p>
          <a href="${params.hostedInvoiceUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">
            View Invoice & Payment Options
          </a>
        </p>
        <p style="margin-bottom: 0;">Payment options:</p>
        <ul style="padding-left: 18px; margin-top: 8px;">
          <li>Zelle to <strong>connect@luxordev.com</strong> with no processing fee</li>
          <li>ACH bank transfer via the hosted invoice page</li>
          <li>Credit card via the hosted invoice page</li>
        </ul>
      </div>
    </div>
  `;

  const apiKey = process.env.RESEND_API_KEY;
  try {
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Luxor Billing <noreply@luxordev.com>",
          to: [params.clientEmail],
          subject: `Invoice ${params.invoiceNumber} from Luxor Developments LLC`,
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[services billing] Resend invoice email error:", err);
      }
      return;
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 0);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !port || !user || !pass || !from) {
      console.warn("[services billing] No provider configured for invoice email");
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: params.clientEmail,
      subject: `Invoice ${params.invoiceNumber} from Luxor Developments LLC`,
      html,
    });
  } catch (err) {
    console.error("[services billing] Failed to send invoice email:", err);
  }
}

const voidServicesInvoice = async (params: { id: string; voidReason?: string | null }) => {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("services_invoices")
    .select("id, status")
    .eq("id", params.id)
    .eq("invoice_type", SERVICES_BILLING_SCOPE)
    .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
    .single();

  if (existingError) throw existingError;

  const currentStatus = String(existing.status || "").toLowerCase();
  if (currentStatus === "paid") {
    throw new Error("Paid invoices cannot be voided");
  }
  if (currentStatus === "void") {
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from("services_invoices")
    .update({
      status: "void",
      voided_at: new Date().toISOString(),
      voided_reason: params.voidReason || "Voided by admin",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("invoice_type", SERVICES_BILLING_SCOPE)
    .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
    .select("id, status, paid_date")
    .single();

  if (error) throw error;
  return data;
};

const getNextInvoiceNumber = async (issueDate?: string | null) => {
  const now = issueDate ? new Date(`${issueDate}T00:00:00Z`) : new Date();
  const billYear = now.getUTCFullYear();
  const yearPrefix = `SVC-${billYear}-`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latest } = await supabaseAdmin
      .from("services_invoices")
      .select("invoice_number")
      .like("invoice_number", `${yearPrefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNumber = latest?.invoice_number?.slice(yearPrefix.length);
    const lastSeq = lastNumber ? Number(lastNumber) : 0;
    const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    const nextNumber = `${yearPrefix}${String(nextSeq).padStart(4, "0")}`;

    const { data: existing } = await supabaseAdmin
      .from("services_invoices")
      .select("id")
      .eq("invoice_number", nextNumber)
      .maybeSingle();

    if (!existing) return nextNumber;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Failed to assign invoice number");
};

const buildServicesInvoicePdf = async (params: {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  companyName?: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  subtotal: number;
  total: number;
}) => {
  const [{ PDFDocument, StandardFonts, rgb }, fs, path] = await Promise.all([
    import("pdf-lib"),
    import("fs"),
    import("path"),
  ]);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const left = 48;
  const right = 420;
  let y = height - 60;
  const line = 14;

  const logoPath = path.join(process.cwd(), "public", "luxor-logo.png");
  if (fs.existsSync(logoPath)) {
    const logoBytes = fs.readFileSync(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.12);
    page.drawImage(logoImage, { x: left, y: y - 6, width: logoDims.width, height: logoDims.height });
  }

  page.drawText("Luxor Developments LLC", { x: left, y: y - 24, size: 11, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText("1317 Edgewater Drive #6772", { x: left, y: y - 38, size: 9, font });
  page.drawText("Orlando, FL 32804", { x: left, y: y - 52, size: 9, font });
  page.drawText("United States", { x: left, y: y - 66, size: 9, font });
  page.drawText("connect@luxordev.com", { x: left, y: y - 80, size: 9, font });

  page.drawText("INVOICE", { x: right, y: y - 6, size: 14, font: boldFont });
  page.drawText(`Invoice #: ${params.invoiceNumber}`, { x: right, y: y - 26, size: 9, font });
  page.drawText(`Issue Date: ${params.issueDate}`, { x: right, y: y - 40, size: 9, font });
  page.drawText(`Due Date: ${params.dueDate}`, { x: right, y: y - 54, size: 9, font });

  y = height - 170;
  page.drawText("Bill To", { x: left, y, size: 10, font: boldFont });
  y -= line;
  page.drawText(params.clientName, { x: left, y, size: 9, font });
  if (params.companyName) {
    y -= line;
    page.drawText(params.companyName, { x: left, y, size: 9, font });
  }
  y -= line;
  page.drawText(params.clientEmail, { x: left, y, size: 9, font });

  y -= line * 2;
  page.drawText("Description", { x: left, y, size: 10, font: boldFont });
  page.drawText("Amount", { x: right, y, size: 10, font: boldFont });
  y -= line;
  page.drawText(params.description, { x: left, y, size: 9, font });
  page.drawText(toCurrency(params.total), { x: right, y, size: 9, font });

  if (params.notes) {
    y -= line * 2;
    page.drawText("Notes", { x: left, y, size: 10, font: boldFont });
    y -= line;
    page.drawText(params.notes, { x: left, y, size: 9, font });
  }

  y -= line * 2;
  page.drawText("Subtotal", { x: left, y, size: 9, font });
  page.drawText(toCurrency(params.subtotal), { x: right, y, size: 9, font });
  y -= line;
  page.drawText("Total", { x: left, y, size: 10, font: boldFont });
  page.drawText(toCurrency(params.total), { x: right, y, size: 10, font: boldFont });

  y -= line * 2;
  page.drawText("Payment instructions", { x: left, y, size: 10, font: boldFont });
  y -= line;
  page.drawText("Zelle (no fee): connect@luxordev.com", { x: left, y, size: 9, font });
  y -= line;
  page.drawText("For ACH or card payments, use the hosted payment page for this invoice.", {
    x: left,
    y,
    size: 9,
    font,
  });

  return pdfDoc.save();
};

const generateInvoicePdf = async (invoice: {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  company_name?: string | null;
  description: string;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  subtotal: number;
  total: number;
}) => {
  const pdfBytes = await buildServicesInvoicePdf({
    invoiceNumber: invoice.invoice_number,
    clientName: invoice.client_name,
    clientEmail: invoice.client_email,
    companyName: invoice.company_name,
    description: invoice.description,
    issueDate: formatDateOnlyString(invoice.issue_date),
    dueDate: formatDateOnlyString(invoice.due_date),
    notes: invoice.notes,
    subtotal: Number(invoice.subtotal || 0),
    total: Number(invoice.total || 0),
  });

  const fileName = `${invoice.invoice_number}-${Date.now()}.pdf`;
  const storagePath = `services-billing/invoices/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  return publicUrl;
};

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("services_invoices")
      .select("*")
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      clientName: row.client_name,
      clientEmail: row.client_email,
      companyName: row.company_name,
      description: row.description,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      subtotal: Number(row.subtotal || 0),
      total: Number(row.total || 0),
      notes: row.notes,
      status: row.status,
      paidDate: row.paid_date,
      pdfUrl: row.pdf_url,
      hostedPagePath: buildServicesInvoicePath(row.hosted_page_token),
      hostedPageToken: row.hosted_page_token,
      stripeSessionId: row.stripe_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      processingStartedAt: row.processing_started_at,
      invoiceType: row.invoice_type,
      paymentAccountScope: row.payment_account_scope,
    }));

    return NextResponse.json({ rows: mapped });
  } catch (error) {
    console.error("Error fetching services invoices:", error);
    return NextResponse.json({ error: "Failed to load services invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      clientName,
      clientEmail,
      companyName,
      description,
      issueDate,
      dueDate,
      amount,
      notes,
    } = body || {};

    if (!clientName || !clientEmail || !description || amount === undefined || !issueDate || !dueDate) {
      return NextResponse.json({ error: "Missing required invoice fields" }, { status: 400 });
    }

    const issueDateOnly = toDateOnlyString(issueDate);
    const dueDateOnly = toDateOnlyString(dueDate);
    const total = Number(amount);
    if (!issueDateOnly || !dueDateOnly || !Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: "Invalid invoice data" }, { status: 400 });
    }

    const invoiceNumber = await getNextInvoiceNumber(issueDateOnly);
    const hostedPageToken = crypto.randomBytes(18).toString("hex");
    const hostedInvoiceUrl = getHostedInvoiceUrl(hostedPageToken);
    const lineItems = [{ description, amount: Number(total.toFixed(2)) }];

    const { data, error } = await supabaseAdmin
      .from("services_invoices")
      .insert({
        invoice_number: invoiceNumber,
        client_name: clientName,
        client_email: clientEmail,
        company_name: companyName || null,
        description,
        line_items: lineItems,
        issue_date: issueDateOnly,
        due_date: dueDateOnly,
        subtotal: total,
        total,
        notes: notes || null,
        status: "issued",
        hosted_page_token: hostedPageToken,
        invoice_type: SERVICES_BILLING_SCOPE,
        payment_account_scope: SERVICES_PLATFORM_SCOPE,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) throw error;

    let pdfUrl: string | null = null;
    let warning: string | null = null;

    try {
      pdfUrl = await generateInvoicePdf(data as any);
      const { error: pdfUpdateError } = await supabaseAdmin
        .from("services_invoices")
        .update({ pdf_url: pdfUrl })
        .eq("id", data.id);
      if (pdfUpdateError) throw pdfUpdateError;
    } catch (pdfError: any) {
      console.error("Services invoice PDF generation failed:", pdfError);
      warning = "Invoice created, but PDF generation is temporarily unavailable.";
    }

    sendServicesInvoiceEmail({
      clientName,
      clientEmail,
      invoiceNumber,
      amount: total,
      dueDate: dueDateOnly,
      description,
      hostedInvoiceUrl,
    }).catch(() => {});

    return NextResponse.json({
      id: data.id,
      invoiceNumber,
      hostedPagePath: buildServicesInvoicePath(hostedPageToken),
      pdfUrl,
      warning,
    });
  } catch (error: any) {
    console.error("Error creating services invoice:", error);
    return NextResponse.json({ error: error.message || "Failed to create services invoice" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, action, voidReason } = body || {};
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (action === "void") {
      const data = await voidServicesInvoice({ id, voidReason });
      return NextResponse.json({ id: data.id, status: data.status, paidDate: null });
    } else if (status === "paid") {
      updates.status = "paid";
      updates.paid_date = new Date().toISOString().split("T")[0];
      updates.processing_started_at = null;
    } else if (status) {
      updates.status = status;
    }

    const { data, error } = await supabaseAdmin
      .from("services_invoices")
      .update(updates)
      .eq("id", id)
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id, status: data.status, paidDate: data.paid_date });
  } catch (error: any) {
    console.error("Error updating services invoice:", error);
    return NextResponse.json({ error: error.message || "Failed to update services invoice" }, { status: 500 });
  }
}
