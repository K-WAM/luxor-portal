import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { toDateOnlyString } from "@/lib/date-only";

const OWNER_BILL_CATEGORIES = [
  "maintenance",
  "pm_fee",
  "hoa",
  "pool",
  "garden",
  "insurance",
  "property_tax",
  "repairs",
  "other",
];

// GET: list all invoices (admin only)
// Query params: includeVoided=true to include voided bills
export async function GET(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeVoided = searchParams.get("includeVoided") === "true";

    let query = supabaseAdmin
      .from("billing_invoices")
      .select(
        `
        *,
        properties ( address )
      `
      )
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    // By default, exclude voided bills unless explicitly requested
    if (!includeVoided) {
      query = query.neq("status", "voided");
    }

    const { data, error } = await query;

    if (error) throw error;

    // Build owner email map
    const ownerIds = Array.from(new Set((data || []).map((row: any) => row.owner_id))).filter(Boolean);
    const ownerEmailMap: Record<string, string> = {};
    if (ownerIds.length) {
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
      userList?.users?.forEach((u) => {
        if (ownerIds.includes(u.id)) ownerEmailMap[u.id] = u.email || u.id;
      });
    }

    const mapped =
      data?.map((row: any) => ({
        id: row.id,
        ownerId: row.owner_id,
        ownerEmail: ownerEmailMap[row.owner_id] || row.owner_id,
        propertyId: row.property_id,
        propertyAddress: row.properties?.address || "",
        property: row.properties?.address || "",
        description: row.description || "",
        amount: row.total_due ?? row.fee_amount ?? 0,
        feePercent: row.fee_percent,
        feeAmount: row.fee_amount,
        baseRent: row.base_rent,
        month: row.month,
        year: row.year,
        status: row.status,
        dueDate: row.due_date,
        paidDate: row.paid_date,
        invoiceUrl: row.invoice_url,
        invoiceNumber: row.invoice_number,
        paymentLinkUrl: row.payment_link_url,
        category: row.category,
        voidedAt: row.voided_at,
        voidedBy: row.voided_by,
        voidedReason: row.voided_reason,
      })) || [];

    return NextResponse.json(mapped);
  } catch (error) {
    console.error("Error fetching billing invoices", error);
    return NextResponse.json({ error: "Failed to fetch billing" }, { status: 500 });
  }
}

// POST: create/update an invoice (admin)
export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      propertyId,
      ownerId: providedOwnerId,
      month,
      year,
      feePercent,
      feeAmount,
      description,
      dueDate,
      category,
      paymentLinkUrl,
    } = body || {};

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    // Validate category if provided
    if (category && !OWNER_BILL_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${OWNER_BILL_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    let ownerId = providedOwnerId;

    // If ownerId not provided, infer from user_properties (owner role)
    if (!ownerId) {
      const { data: ownerRow, error: ownerErr } = await supabaseAdmin
        .from("user_properties")
        .select("user_id")
        .eq("property_id", propertyId)
        .eq("role", "owner")
        .limit(1)
        .single();

      if (ownerErr || !ownerRow) {
        return NextResponse.json({ error: "No owner found for this property" }, { status: 400 });
      }

      ownerId = ownerRow.user_id;
    }

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("target_monthly_rent")
      .eq("id", propertyId)
      .single();

    const baseRent = property?.target_monthly_rent || 0;
    const percent = feePercent !== undefined && feePercent !== null ? parseFloat(String(feePercent)) : null;
    const override = feeAmount !== undefined && feeAmount !== null ? parseFloat(String(feeAmount)) : null;
    const computed = override !== null ? override : percent !== null ? (baseRent || 0) * (percent / 100) : 0;

    const normalizedDueDate = toDateOnlyString(dueDate);

    // Derive month/year from dueDate if provided, otherwise use current date
    let billMonth: number;
    let billYear: number;
    if (normalizedDueDate) {
      const dueDateObj = new Date(normalizedDueDate + "T00:00:00Z");
      billMonth = dueDateObj.getUTCMonth() + 1;
      billYear = dueDateObj.getUTCFullYear();
    } else if (month && year) {
      // Fallback to provided month/year (for backwards compatibility)
      billMonth = month;
      billYear = year;
    } else {
      // Default to current month/year
      const now = new Date();
      billMonth = now.getMonth() + 1;
      billYear = now.getFullYear();
    }

    // Always INSERT a new bill (not upsert) to allow multiple bills per month
    const { data, error } = await supabaseAdmin
      .from("billing_invoices")
      .insert({
        property_id: propertyId,
        owner_id: ownerId,
        month: billMonth,
        year: billYear,
        base_rent: baseRent,
        fee_percent: percent,
        fee_amount: override,
        total_due: computed,
        description: description || "",
        due_date: normalizedDueDate,
        status: "due",
        category: category || "pm_fee",
        payment_link_url: paymentLinkUrl || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      ownerId: data.owner_id,
      propertyId: data.property_id,
      month: data.month,
      year: data.year,
      totalDue: data.total_due,
      feePercent: data.fee_percent,
      feeAmount: data.fee_amount,
      status: data.status,
      description: data.description,
      dueDate: data.due_date,
    });
  } catch (error) {
    console.error("Error creating/updating billing invoice", error);
    return NextResponse.json({ error: "Failed to save billing invoice" }, { status: 500 });
  }
}

// PATCH: update fields like status, fee_percent, fee_amount, due_date, paid_date
// Also supports explicit void action and auto-voids when amount becomes $0
export async function PATCH(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      status,
      feePercent,
      feeAmount,
      dueDate,
      paidDate,
      description,
      invoiceUrl,
      paymentLinkUrl,
      category,
      action,
      voidReason,
      ownerId,
    } = body || {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Handle explicit VOID action
    if (action === "void") {
      const { data, error } = await supabaseAdmin
        .from("billing_invoices")
        .update({
          status: "voided",
          voided_at: new Date().toISOString(),
          voided_by: user.id,
          voided_reason: voidReason || "Voided by admin",
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ ...data, action: "voided" });
    }

    // Validate category if provided
    if (category && !OWNER_BILL_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${OWNER_BILL_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (description !== undefined) updates.description = description;
    if (invoiceUrl !== undefined) updates.invoice_url = invoiceUrl;
    if (paymentLinkUrl !== undefined) updates.payment_link_url = paymentLinkUrl || null;
    if (category !== undefined) updates.category = category;
    if (ownerId !== undefined) updates.owner_id = ownerId;
    if (dueDate !== undefined) {
      updates.due_date = toDateOnlyString(dueDate);
    }
    if (paidDate !== undefined) {
      updates.paid_date = toDateOnlyString(paidDate);
    }
    if (feePercent !== undefined) updates.fee_percent = feePercent === null ? null : parseFloat(String(feePercent));
    if (feeAmount !== undefined) updates.fee_amount = feeAmount === null ? null : parseFloat(String(feeAmount));

    // Recompute total_due if fee fields changed
    if ("fee_percent" in updates || "fee_amount" in updates) {
      const { data: existing } = await supabaseAdmin
        .from("billing_invoices")
        .select("base_rent, fee_percent, fee_amount")
        .eq("id", id)
        .single();
      const baseRent = existing?.base_rent || 0;
      const percent = updates.fee_percent ?? existing?.fee_percent ?? null;
      const override = updates.fee_amount ?? existing?.fee_amount ?? null;
      updates.total_due =
        override !== null && override !== undefined ? override : percent !== null ? baseRent * (percent / 100) : 0;

      // AUTO-VOID: If total_due becomes $0, automatically void the bill
      if (updates.total_due === 0) {
        updates.status = "voided";
        updates.voided_at = new Date().toISOString();
        updates.voided_by = user.id;
        updates.voided_reason = "Auto-voided: amount set to $0";
      }
    }

    const { data, error } = await supabaseAdmin
      .from("billing_invoices")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating billing invoice", error);
    return NextResponse.json({ error: "Failed to update billing invoice" }, { status: 500 });
  }
}

// DELETE: remove a billing invoice (admin)
export async function DELETE(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("billing_invoices").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting billing invoice", error);
    return NextResponse.json({ error: "Failed to delete billing invoice" }, { status: 500 });
  }
}
