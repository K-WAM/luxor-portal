import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { getDateOnlyParts, toDateOnlyString } from "@/lib/date-only";

const BILL_TYPES = ["rent", "fee", "late_fee", "security_deposit", "hoa", "maintenance", "other"];
const BILL_STATUSES = ["due", "paid", "overdue", "pending", "voided"];

const getPropertyAddress = (properties: any) => {
  if (!properties) return "";
  if (Array.isArray(properties)) {
    return properties[0]?.address || "";
  }
  return properties.address || "";
};

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const includeVoided = searchParams.get("includeVoided") === "true";

    let query = supabaseAdmin
      .from("tenant_bills")
      .select(
        `
        id,
        tenant_id,
        property_id,
        bill_type,
        description,
        amount,
        due_date,
        status,
        notify_tenant,
        month,
        year,
        created_at,
        voided_at,
        voided_by,
        voided_reason,
        properties (
          id,
          address
        )
      `
      );

    if (status && BILL_STATUSES.includes(status)) {
      query = query.eq("status", status);
    } else if (!includeVoided) {
      // By default, exclude voided bills unless explicitly requested
      query = query.neq("status", "voided");
    }

    const { data: bills, error } = await query.order("due_date", { ascending: false });

    if (error) throw error;

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const userEmailMap = new Map<string, string>();
    (usersData?.users || []).forEach((u) => {
      if (u.id) userEmailMap.set(u.id, u.email || "");
    });

    const rows = (bills || []).map((bill: any) => ({
      id: bill.id,
      tenantId: bill.tenant_id,
      tenantEmail: userEmailMap.get(bill.tenant_id) || "",
      propertyId: bill.property_id,
      propertyAddress: getPropertyAddress(bill.properties),
      bill_type: bill.bill_type,
      description: bill.description,
      amount: bill.amount,
      due_date: bill.due_date,
      status: bill.status,
      notify_tenant: bill.notify_tenant,
      month: bill.month,
      year: bill.year,
      created_at: bill.created_at,
      voidedAt: bill.voided_at,
      voidedBy: bill.voided_by,
      voidedReason: bill.voided_reason,
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error fetching tenant bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenant bills" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      propertyId,
      tenantId,
      billType,
      amount,
      dueDate,
      description,
      notifyTenant,
    } = body || {};

    if (!propertyId || !tenantId || !billType || !dueDate) {
      return NextResponse.json(
        { error: "propertyId, tenantId, billType, and dueDate are required" },
        { status: 400 }
      );
    }

    if (!BILL_TYPES.includes(billType)) {
      return NextResponse.json(
        { error: `billType must be one of ${BILL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const normalizedDueDate = toDateOnlyString(dueDate);
    const parts = getDateOnlyParts(normalizedDueDate);
    if (!normalizedDueDate || !parts) {
      return NextResponse.json(
        { error: "dueDate must be a valid date" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("tenant_bills")
      .insert({
        property_id: propertyId,
        tenant_id: tenantId,
        bill_type: billType,
        description: description ? String(description).trim() : null,
        amount: parsedAmount,
        due_date: normalizedDueDate,
        status: "due",
        notify_tenant: !!notifyTenant,
        month: parts.month,
        year: parts.year,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ bill: data });
  } catch (error) {
    console.error("Error creating tenant bill:", error);
    return NextResponse.json(
      { error: "Failed to create tenant bill" },
      { status: 500 }
    );
  }
}

// PATCH: update tenant bill fields or perform actions (void)
export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      status,
      amount,
      description,
      dueDate,
      billType,
      action,
      voidReason,
    } = body || {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Handle explicit VOID action
    if (action === "void") {
      const { data, error } = await supabaseAdmin
        .from("tenant_bills")
        .update({
          status: "voided",
          voided_at: new Date().toISOString(),
          voided_by: user.id,
          voided_reason: voidReason || "Voided by admin",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ bill: data, action: "voided" });
    }

    // Build update object with all provided fields
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      if (!BILL_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of ${BILL_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.status = status;
    }

    if (amount !== undefined) {
      const parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount)) {
        return NextResponse.json(
          { error: "amount must be a valid number" },
          { status: 400 }
        );
      }
      updates.amount = parsedAmount;

      // AUTO-VOID: If amount becomes $0, automatically void the bill
      if (parsedAmount === 0) {
        updates.status = "voided";
        updates.voided_at = new Date().toISOString();
        updates.voided_by = user.id;
        updates.voided_reason = "Auto-voided: amount set to $0";
      }
    }

    if (description !== undefined) {
      updates.description = description ? String(description).trim() : null;
    }

    if (dueDate !== undefined) {
      const normalizedDueDate = toDateOnlyString(dueDate);
      if (!normalizedDueDate) {
        return NextResponse.json(
          { error: "dueDate must be a valid date" },
          { status: 400 }
        );
      }
      updates.due_date = normalizedDueDate;
      const parts = getDateOnlyParts(normalizedDueDate);
      if (parts) {
        updates.month = parts.month;
        updates.year = parts.year;
      }
    }

    if (billType !== undefined) {
      if (!BILL_TYPES.includes(billType)) {
        return NextResponse.json(
          { error: `billType must be one of ${BILL_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.bill_type = billType;
    }

    const { data, error } = await supabaseAdmin
      .from("tenant_bills")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ bill: data });
  } catch (error) {
    console.error("Error updating tenant bill:", error);
    return NextResponse.json(
      { error: "Failed to update tenant bill" },
      { status: 500 }
    );
  }
}

// DELETE: hard delete a tenant bill (admin only)
export async function DELETE(request: Request) {
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

    const { error } = await supabaseAdmin
      .from("tenant_bills")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Error deleting tenant bill:", error);
    return NextResponse.json(
      { error: "Failed to delete tenant bill" },
      { status: 500 }
    );
  }
}
