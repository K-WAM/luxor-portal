import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const STORAGE_BUCKET = "property-documents";

const isPdfFile = (file: File) => {
  const name = file.name || "";
  const type = file.type || "";
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
};

const extractStoragePath = (fileUrl: string | null) => {
  if (!fileUrl) return null;
  const parts = fileUrl.split(`/${STORAGE_BUCKET}/`);
  return parts[1] || null;
};

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const billId = formData.get("billId") as string | null;
    const file = formData.get("file") as File | null;

    if (!billId) {
      return NextResponse.json({ error: "billId is required" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!isPdfFile(file)) {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from("billing_invoices")
      .select("id, property_id, invoice_url")
      .eq("id", billId)
      .single();
    if (billError || !bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const fileName = `${billId}-${Date.now()}.pdf`;
    const storagePath = `${bill.property_id}/invoices/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: "application/pdf" });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const { error: updateError } = await supabaseAdmin
      .from("billing_invoices")
      .update({ invoice_url: publicUrl })
      .eq("id", billId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const oldPath = extractStoragePath(bill.invoice_url || null);
    if (oldPath) {
      await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([oldPath]);
    }

    return NextResponse.json({ invoiceUrl: publicUrl });
  } catch (error: any) {
    console.error("Error uploading invoice PDF:", error);
    return NextResponse.json({ error: error.message || "Failed to upload invoice PDF" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const billId = searchParams.get("billId");
    if (!billId) {
      return NextResponse.json({ error: "billId is required" }, { status: 400 });
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from("billing_invoices")
      .select("invoice_url")
      .eq("id", billId)
      .single();
    if (billError || !bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const storagePath = extractStoragePath(bill.invoice_url || null);
    if (storagePath) {
      await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    }

    const { error: updateError } = await supabaseAdmin
      .from("billing_invoices")
      .update({ invoice_url: null })
      .eq("id", billId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error removing invoice PDF:", error);
    return NextResponse.json({ error: error.message || "Failed to remove invoice PDF" }, { status: 500 });
  }
}
