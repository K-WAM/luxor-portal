import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { getDateOnlyParts } from "@/lib/date-only";

const BILL_TYPES = ["rent", "fee", "late_fee", "security_deposit"];

const getPropertyAddress = (properties: any) => {
  if (!properties) return "";
  if (Array.isArray(properties)) {
    return properties[0]?.address || "";
  }
  return properties.address || "";
};

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: bills, error } = await supabaseAdmin
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
        properties (
          id,
          address
        )
      `
      )
      .order("due_date", { ascending: false });

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

    const parts = getDateOnlyParts(dueDate);
    if (!parts) {
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
        due_date: dueDate,
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
