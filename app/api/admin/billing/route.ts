import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

// GET: list all invoices (admin only)
export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("billing_invoices")
      .select(
        `
        *,
        properties ( address ),
        owners:owner_id ( email )
      `
      )
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) throw error;

    const mapped =
      data?.map((row: any) => ({
        id: row.id,
        ownerId: row.owner_id,
        ownerEmail: row.owners?.email || "",
        propertyId: row.property_id,
        propertyAddress: row.properties?.address || "",
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
      ownerId,
      month,
      year,
      feePercent,
      feeAmount,
      description,
      dueDate,
    } = body || {};

    if (!propertyId || !ownerId || !month || !year) {
      return NextResponse.json({ error: "propertyId, ownerId, month, and year are required" }, { status: 400 });
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

    const { data, error } = await supabaseAdmin
      .from("billing_invoices")
      .upsert(
        {
          property_id: propertyId,
          owner_id: ownerId,
          month,
          year,
          base_rent: baseRent,
          fee_percent: percent,
          fee_amount: override,
          total_due: computed,
          description: description || "",
          due_date: dueDate || null,
          status: "due",
        },
        { onConflict: "property_id,owner_id,month,year" }
      )
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
export async function PATCH(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, feePercent, feeAmount, dueDate, paidDate, description, invoiceUrl } = body || {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (description !== undefined) updates.description = description;
    if (invoiceUrl !== undefined) updates.invoice_url = invoiceUrl;
    if (dueDate !== undefined) updates.due_date = dueDate || null;
    if (paidDate !== undefined) updates.paid_date = paidDate || null;
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
