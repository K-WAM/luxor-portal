import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildServicesInvoicePath, SERVICES_BILLING_SCOPE, SERVICES_PLATFORM_SCOPE } from "@/lib/services-billing";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Invoice token is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("services_invoices")
      .select("*")
      .eq("hosted_page_token", token)
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      invoiceNumber: data.invoice_number,
      clientName: data.client_name,
      clientEmail: data.client_email,
      companyName: data.company_name,
      description: data.description,
      lineItems: data.line_items || [],
      issueDate: data.issue_date,
      dueDate: data.due_date,
      subtotal: Number(data.subtotal || 0),
      total: Number(data.total || 0),
      notes: data.notes,
      status: data.status,
      paidDate: data.paid_date,
      pdfUrl: data.pdf_url,
      hostedPagePath: buildServicesInvoicePath(token),
      token,
    });
  } catch (error) {
    console.error("Error loading public services invoice:", error);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }
}
