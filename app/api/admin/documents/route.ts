// app/api/admin/documents/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { isTenantSensitiveDocumentType } from "@/lib/document-scope";

// GET /api/admin/documents - Admin sees ALL documents
export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error} = await supabaseAdmin
      .from("property_documents")
      .select("id, property_id, lease_agreement_id, document_type, title, file_url, visibility, created_at, name, lease_agreements(lease_start_date, lease_end_date)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    console.error("GET /api/admin/documents error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || "").trim();
    const propertyId = String(body.property_id || "").trim();
    const title = String(body.title || "").trim();
    const documentType = String(body.document_type || "").trim();
    const visibility = String(body.visibility || "").trim();
    const scope = String(body.scope || "").trim().toLowerCase();
    const leaseAgreementIdRaw = String(body.lease_agreement_id || "").trim();
    const leaseAgreementId = leaseAgreementIdRaw || null;

    if (!id) {
      return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
    }

    if (!propertyId) {
      return NextResponse.json({ error: "Property is required" }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "Document name is required" }, { status: 400 });
    }

    if (!documentType) {
      return NextResponse.json({ error: "Document type is required" }, { status: 400 });
    }

    if (!["admin", "owner", "tenant", "all"].includes(visibility)) {
      return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }

    if (!["property", "lease"].includes(scope)) {
      return NextResponse.json({ error: "Invalid document scope" }, { status: 400 });
    }

    const { data: existingDocument, error: existingDocumentError } = await supabaseAdmin
      .from("property_documents")
      .select("id")
      .eq("id", id)
      .single();

    if (existingDocumentError || !existingDocument) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return NextResponse.json({ error: "Selected property was not found" }, { status: 400 });
    }

    if (scope === "lease" && !leaseAgreementId) {
      return NextResponse.json({ error: "Lease agreement is required for lease-specific documents" }, { status: 400 });
    }

    if (scope === "property" && leaseAgreementId) {
      return NextResponse.json({ error: "Property-wide documents cannot keep a lease association" }, { status: 400 });
    }

    if (isTenantSensitiveDocumentType(documentType) && scope !== "lease") {
      return NextResponse.json(
        { error: "Tenant-sensitive document types must be lease-specific" },
        { status: 400 }
      );
    }

    if (leaseAgreementId) {
      const { data: leaseAgreement, error: leaseAgreementError } = await supabaseAdmin
        .from("lease_agreements")
        .select("id, property_id")
        .eq("id", leaseAgreementId)
        .single();

      if (leaseAgreementError || !leaseAgreement) {
        return NextResponse.json({ error: "Selected lease agreement was not found" }, { status: 400 });
      }

      if (leaseAgreement.property_id !== propertyId) {
        return NextResponse.json(
          { error: "Lease agreement does not belong to the selected property" },
          { status: 400 }
        );
      }
    }

    const { data: updatedDocument, error: updateError } = await supabaseAdmin
      .from("property_documents")
      .update({
        property_id: propertyId,
        title,
        document_type: documentType,
        visibility,
        lease_agreement_id: scope === "lease" ? leaseAgreementId : null,
      })
      .eq("id", id)
      .select("id, property_id, lease_agreement_id, document_type, title, file_url, visibility, created_at, name, lease_agreements(lease_start_date, lease_end_date)")
      .single();

    if (updateError) {
      console.error("Supabase PATCH error:", updateError);
      return NextResponse.json({ error: "Failed to update document metadata" }, { status: 500 });
    }

    return NextResponse.json(updatedDocument, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/admin/documents error:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
