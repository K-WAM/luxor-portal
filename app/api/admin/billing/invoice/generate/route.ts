import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const STORAGE_BUCKET = "property-documents";
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "2-digit" });

const formatDateOnlyString = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00Z`);
  return formatDate(date);
};

const getOrCreateInvoiceMeta = async (billId: string, dueDate?: string | null) => {
  const { data: current } = await supabaseAdmin
    .from("billing_invoices")
    .select("invoice_number, invoice_date")
    .eq("id", billId)
    .maybeSingle();

  if (current?.invoice_number && current?.invoice_date) {
    return {
      invoiceNumber: current.invoice_number as string,
      invoiceDate: current.invoice_date as string,
    };
  }

  const now = new Date();
  const billYear = dueDate ? new Date(`${dueDate}T00:00:00Z`).getUTCFullYear() : now.getUTCFullYear();
  const yearPrefix = `INV-${billYear}-`;
  const todayDate = now.toISOString().slice(0, 10);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latest } = await supabaseAdmin
      .from("billing_invoices")
      .select("invoice_number")
      .like("invoice_number", `${yearPrefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNumber = latest?.invoice_number?.slice(yearPrefix.length);
    const lastSeq = lastNumber ? Number(lastNumber) : 0;
    const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    const nextNumber = `${yearPrefix}${String(nextSeq).padStart(4, "0")}`;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("billing_invoices")
      .update({ invoice_number: nextNumber, invoice_date: todayDate })
      .eq("id", billId)
      .is("invoice_number", null)
      .select("invoice_number")
      .maybeSingle();

    if (!updateError && updated?.invoice_number) {
      return { invoiceNumber: updated.invoice_number as string, invoiceDate: todayDate };
    }
    if (updateError && updateError.code !== "23505") throw updateError;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const { data: fallback } = await supabaseAdmin
    .from("billing_invoices")
    .select("invoice_number, invoice_date")
    .eq("id", billId)
    .maybeSingle();

  if (fallback?.invoice_number) {
    const fallbackDate = fallback.invoice_date || todayDate;
    if (!fallback.invoice_date) {
      await supabaseAdmin.from("billing_invoices").update({ invoice_date: fallbackDate }).eq("id", billId);
    }
    return { invoiceNumber: fallback.invoice_number as string, invoiceDate: fallbackDate };
  }
  throw new Error("Failed to assign invoice number");
};

const buildInvoicePdf = async (params: {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  ownerName: string;
  ownerEmail: string;
  propertyAddress: string;
  description: string;
  amountDue: number;
}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const left = 48;
  const right = 440;
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
  page.drawText(`Invoice Date: ${params.invoiceDate}`, { x: right, y: y - 40, size: 9, font });
  page.drawText(`Due Date: ${params.dueDate}`, { x: right, y: y - 54, size: 9, font });

  y = height - 170;
  page.drawText("Bill To", { x: left, y, size: 10, font: boldFont });
  y -= line;
  if (params.ownerName) {
    page.drawText(params.ownerName, { x: left, y, size: 9, font });
    y -= line;
  }
  page.drawText(params.ownerEmail, { x: left, y, size: 9, font });

  y -= line * 2;
  page.drawText("Property", { x: left, y, size: 10, font: boldFont });
  y -= line;
  page.drawText(params.propertyAddress, { x: left, y, size: 9, font });

  y -= line * 2;
  page.drawText("Description", { x: left, y, size: 10, font: boldFont });
  page.drawText("Amount", { x: right, y, size: 10, font: boldFont });
  y -= line;
  page.drawText(params.description, { x: left, y, size: 9, font });
  page.drawText(`$${params.amountDue.toFixed(2)}`, { x: right, y, size: 9, font });

  y -= line * 2;
  page.drawText("Subtotal", { x: left, y, size: 9, font });
  page.drawText(`$${params.amountDue.toFixed(2)}`, { x: right, y, size: 9, font });
  y -= line;
  page.drawText("Total", { x: left, y, size: 9, font });
  page.drawText(`$${params.amountDue.toFixed(2)}`, { x: right, y, size: 9, font });
  y -= line;
  page.drawText("Amount Due", { x: left, y, size: 10, font: boldFont });
  page.drawText(`$${params.amountDue.toFixed(2)}`, { x: right, y, size: 10, font: boldFont });

  y -= line * 2;
  page.drawText("Payment instructions", { x: left, y, size: 10, font: boldFont });
  y -= line;
  page.drawText("Zelle (no fee):", { x: left, y, size: 9, font: boldFont });
  y -= line;
  page.drawText("Please send payment to Connect@luxordev.com", { x: left, y, size: 9, font });
  y -= line;
  page.drawText("Include the invoice number in the memo.", { x: left, y, size: 9, font });
  y -= line * 1.5;
  page.drawText("To pay by bank transfer (ACH) or credit card,", { x: left, y, size: 9, font });
  y -= line;
  page.drawText("please use the payment buttons available in the Luxor portal.", { x: left, y, size: 9, font });
  y -= line;
  page.drawText("Stripe processing fees apply and are charged on top of the invoice total.", {
    x: left,
    y,
    size: 9,
    font,
  });

  return pdfDoc.save();
};

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { billId } = body || {};
    if (!billId) {
      return NextResponse.json({ error: "billId is required" }, { status: 400 });
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from("billing_invoices")
      .select(
        "id, owner_id, property_id, total_due, fee_amount, description, due_date, created_at, invoice_url, invoice_number, invoice_date, category"
      )
      .eq("id", billId)
      .single();

    if (billError || !bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    if (bill.category !== "pm_fee") {
      return NextResponse.json({ error: "Invoice generation only allowed for PM fee bills" }, { status: 400 });
    }

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("address, owner_name")
      .eq("id", bill.property_id)
      .single();

    const owner = await supabaseAdmin.auth.admin.getUserById(bill.owner_id);
    const ownerEmail = owner?.data?.user?.email || bill.owner_id;
    const ownerName =
      (owner?.data?.user?.user_metadata as any)?.full_name ||
      (owner?.data?.user?.user_metadata as any)?.name ||
      property?.owner_name ||
      "";

    const { invoiceNumber, invoiceDate: storedInvoiceDate } = await getOrCreateInvoiceMeta(bill.id, bill.due_date);
    const invoiceDate = storedInvoiceDate ? formatDateOnlyString(storedInvoiceDate) : formatDate(new Date());
    const dueDate = bill.due_date
      ? formatDateOnlyString(bill.due_date)
      : formatDate(new Date(Date.now() + 30 * DAY_MS));
    const amountDue = Number(bill.total_due ?? bill.fee_amount ?? 0);

    const pdfBytes = await buildInvoicePdf({
      invoiceNumber,
      invoiceDate,
      dueDate,
      ownerName,
      ownerEmail,
      propertyAddress: property?.address || "",
      description: bill.description || "Property Management Fee",
      amountDue,
    });

    const fileName = `${billId}-${Date.now()}.pdf`;
    const storagePath = `${bill.property_id}/invoices/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, pdfBytes, { contentType: "application/pdf" });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    const { error: updateError } = await supabaseAdmin
      .from("billing_invoices")
      .update({ invoice_url: publicUrl })
      .eq("id", billId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (bill.invoice_url) {
      const parts = bill.invoice_url.split(`/${STORAGE_BUCKET}/`);
      const oldPath = parts[1] || null;
      if (oldPath) {
        await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([oldPath]);
      }
    }

    return NextResponse.json({ invoiceUrl: publicUrl, invoiceNumber });
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error);
    return NextResponse.json({ error: error.message || "Failed to generate invoice PDF" }, { status: 500 });
  }
}
