import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { getDateOnlyParts, toDateOnlyString } from "@/lib/date-only";
import { buildLeaseBillDrafts, buildLeaseBillIdentityKey } from "@/lib/billing/lease-bill-generation";
import { sendManualTenantBillPaidConfirmation } from "@/lib/billing/stripe-status-sync";

const BILL_TYPES = ["rent", "fee", "late_fee", "security_deposit", "hoa", "maintenance", "other"] as const;
const BILL_STATUSES = ["due", "paid", "overdue", "pending", "processing", "voided"] as const;
const BILL_SCOPES = ["tenant", "lease"] as const;

type TenantBillScope = (typeof BILL_SCOPES)[number];

const getPropertyAddress = (properties: any) => {
  if (!properties) return "";
  if (Array.isArray(properties)) {
    return properties[0]?.address || "";
  }
  return properties.address || "";
};

const hasMissingTenantBillScopeColumns = (error: any) =>
  String(error?.message || "").includes("bill_scope") ||
  String(error?.message || "").includes("lease_agreement_id");

const isValidBillType = (value: string): value is (typeof BILL_TYPES)[number] =>
  BILL_TYPES.includes(value as (typeof BILL_TYPES)[number]);

const normalizeBillScope = (value?: string | null): TenantBillScope =>
  String(value || "").trim().toLowerCase() === "lease" ? "lease" : "tenant";

const parsePositiveAmount = (amount: unknown) => {
  const parsed = parseFloat(String(amount));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getNormalizedDueDateParts = (dueDate: unknown) => {
  const normalized = dueDate === null || dueDate === undefined ? null : toDateOnlyString(String(dueDate));
  const parts = getDateOnlyParts(normalized);
  if (!normalized || !parts) return null;
  return { normalized, parts };
};

const loadLeaseAgreementContext = async (propertyId: string, leaseAgreementId: string) => {
  const { data: leaseAgreement, error: leaseAgreementError } = await supabaseAdmin
    .from("lease_agreements")
    .select("id, property_id, lease_start_date, lease_end_date, monthly_rent")
    .eq("id", leaseAgreementId)
    .maybeSingle();

  if (leaseAgreementError) throw leaseAgreementError;
  if (!leaseAgreement) {
    return { error: "Selected lease agreement was not found" as const };
  }
  if (leaseAgreement.property_id !== propertyId) {
    return { error: "Lease agreement does not belong to the selected property" as const };
  }

  const { data: leaseTenantLinks, error: leaseTenantLinksError } = await supabaseAdmin
    .from("lease_agreement_tenants")
    .select("user_id")
    .eq("lease_agreement_id", leaseAgreementId);

  if (leaseTenantLinksError) throw leaseTenantLinksError;
  const tenantIds = (leaseTenantLinks || []).map((row: any) => row.user_id).filter(Boolean);

  return {
    leaseAgreement,
    tenantIds,
    error: tenantIds.length === 0 ? ("Selected lease does not have any linked tenants" as const) : null,
  };
};

const validateTenantAssignment = async (propertyId: string, tenantId: string) => {
  const { data: assignment, error } = await supabaseAdmin
    .from("user_properties")
    .select("user_id")
    .eq("property_id", propertyId)
    .eq("user_id", tenantId)
    .eq("role", "tenant")
    .maybeSingle();

  if (error) throw error;
  return !!assignment;
};

const buildBillPayload = (input: {
  propertyId: string;
  tenantId: string | null;
  leaseAgreementId: string | null;
  billScope: TenantBillScope;
  billType: string;
  description?: string | null;
  amount: number;
  dueDate: string;
  notifyTenant: boolean;
  paymentLinkUrl?: string | null;
}) => {
  const due = getNormalizedDueDateParts(input.dueDate);
  if (!due) return null;

  return {
    property_id: input.propertyId,
    tenant_id: input.billScope === "tenant" ? input.tenantId : null,
    lease_agreement_id: input.billScope === "lease" ? input.leaseAgreementId : null,
    bill_scope: input.billScope,
    bill_type: input.billType,
    description: input.description ? String(input.description).trim() : null,
    amount: input.amount,
    due_date: due.normalized,
    status: "due",
    notify_tenant: input.billScope === "tenant" ? !!input.notifyTenant : false,
    payment_link_url: input.paymentLinkUrl || null,
    month: due.parts.month,
    year: due.parts.year,
  };
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

    const baseSelect = `
      id,
      tenant_id,
      property_id,
      bill_type,
      description,
      amount,
      due_date,
      status,
      notify_tenant,
      invoice_url,
      payment_link_url,
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
    `;

    const selectWithEnhancements = `
      id,
      tenant_id,
      property_id,
      lease_agreement_id,
      bill_scope,
      bill_type,
      description,
      amount,
      due_date,
      status,
      notify_tenant,
      invoice_url,
      payment_link_url,
      stripe_session_id,
      stripe_payment_intent_id,
      month,
      year,
      created_at,
      voided_at,
      voided_by,
      voided_reason,
      properties (
        id,
        address
      ),
      lease_agreements (
        lease_start_date,
        lease_end_date
      )
    `;

    let query = supabaseAdmin.from("tenant_bills").select(selectWithEnhancements);
    if (status && BILL_STATUSES.includes(status as any)) {
      query = query.eq("status", status);
    } else if (!includeVoided) {
      query = query.neq("status", "voided");
    }

    const initialResult = await query.order("due_date", { ascending: false });
    let bills: any[] | null = initialResult.data as any[] | null;
    let error = initialResult.error;

    if (
      error &&
      (String(error.message || "").includes("stripe_session_id") ||
        String(error.message || "").includes("stripe_payment_intent_id") ||
        hasMissingTenantBillScopeColumns(error))
    ) {
      let fallbackQuery = supabaseAdmin.from("tenant_bills").select(baseSelect);
      if (status && BILL_STATUSES.includes(status as any)) {
        fallbackQuery = fallbackQuery.eq("status", status);
      } else if (!includeVoided) {
        fallbackQuery = fallbackQuery.neq("status", "voided");
      }
      const fallback = await fallbackQuery.order("due_date", { ascending: false });
      bills = (fallback.data as any[] | null) ?? null;
      error = fallback.error;
    }

    if (error) throw error;

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;

    const userEmailMap = new Map<string, string>();
    const userNameMap = new Map<string, string>();
    (usersData?.users || []).forEach((u) => {
      if (!u.id) return;
      userEmailMap.set(u.id, u.email || "");
      const metadataName = String(u.user_metadata?.name || "").trim();
      userNameMap.set(u.id, metadataName || (u.email || "").split("@")[0] || "Tenant");
    });

    const leaseIds = Array.from(
      new Set((bills || []).map((bill: any) => String(bill.lease_agreement_id || "").trim()).filter(Boolean))
    );

    const leaseTenantMap = new Map<string, { names: string[]; emails: string[] }>();
    if (leaseIds.length) {
      const { data: leaseTenantRows, error: leaseTenantError } = await supabaseAdmin
        .from("lease_agreement_tenants")
        .select("lease_agreement_id, user_id")
        .in("lease_agreement_id", leaseIds);
      if (leaseTenantError) throw leaseTenantError;

      for (const row of leaseTenantRows || []) {
        const key = row.lease_agreement_id;
        const current = leaseTenantMap.get(key) || { names: [], emails: [] };
        const name = userNameMap.get(row.user_id) || "Tenant";
        const email = userEmailMap.get(row.user_id) || "";
        current.names.push(name);
        if (email) current.emails.push(email);
        leaseTenantMap.set(key, current);
      }
    }

    const rows = (bills || []).map((bill: any) => {
      const scope = normalizeBillScope(bill.bill_scope);
      const leaseTenants = bill.lease_agreement_id ? leaseTenantMap.get(bill.lease_agreement_id) : null;
      return {
        id: bill.id,
        tenantId: bill.tenant_id,
        tenantEmail: userEmailMap.get(bill.tenant_id) || "",
        tenantName: userNameMap.get(bill.tenant_id) || "",
        propertyId: bill.property_id,
        propertyAddress: getPropertyAddress(bill.properties),
        leaseAgreementId: bill.lease_agreement_id || null,
        leaseStartDate: bill.lease_agreements?.lease_start_date || null,
        leaseEndDate: bill.lease_agreements?.lease_end_date || null,
        leaseTenantNames: leaseTenants?.names || [],
        leaseTenantEmails: leaseTenants?.emails || [],
        billScope: scope,
        bill_type: bill.bill_type,
        description: bill.description,
        amount: bill.amount,
        due_date: bill.due_date,
        status: bill.status,
        notify_tenant: bill.notify_tenant,
        invoiceUrl: bill.invoice_url,
        paymentLinkUrl: bill.payment_link_url,
        stripeSessionId: bill.stripe_session_id,
        stripePaymentIntentId: bill.stripe_payment_intent_id,
        month: bill.month,
        year: bill.year,
        created_at: bill.created_at,
        voidedAt: bill.voided_at,
        voidedBy: bill.voided_by,
        voidedReason: bill.voided_reason,
      };
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error fetching tenant bills:", error);
    return NextResponse.json({ error: "Failed to fetch tenant bills" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    if (body?.action === "generateLeaseBills") {
      const propertyId = String(body.propertyId || "").trim();
      const leaseAgreementId = String(body.leaseAgreementId || "").trim();
      const securityDepositAmount = parseFloat(String(body.securityDepositAmount || "0"));

      if (!propertyId || !leaseAgreementId) {
        return NextResponse.json({ error: "propertyId and leaseAgreementId are required" }, { status: 400 });
      }

      const leaseContext = await loadLeaseAgreementContext(propertyId, leaseAgreementId);
      if ("error" in leaseContext && leaseContext.error) {
        return NextResponse.json({ error: leaseContext.error }, { status: 400 });
      }

      const drafts = buildLeaseBillDrafts({
        leaseStartDate: leaseContext.leaseAgreement.lease_start_date,
        leaseEndDate: leaseContext.leaseAgreement.lease_end_date,
        monthlyRent: Number(leaseContext.leaseAgreement.monthly_rent || 0),
        securityDepositAmount: Number.isFinite(securityDepositAmount) ? securityDepositAmount : 0,
      });

      if (!drafts.length) {
        return NextResponse.json({ error: "No lease bills could be generated from the selected lease." }, { status: 400 });
      }

      const dueDates = drafts.map((draft) => draft.dueDate);
      const billTypes = Array.from(new Set(drafts.map((draft) => draft.billType)));

      const { data: existingBills, error: existingBillsError } = await supabaseAdmin
        .from("tenant_bills")
        .select("id, tenant_id, lease_agreement_id, bill_scope, bill_type, due_date, status")
        .eq("property_id", propertyId)
        .in("bill_type", billTypes)
        .in("due_date", dueDates)
        .neq("status", "voided");

      if (existingBillsError) throw existingBillsError;

      const existingKeys = new Set<string>();
      for (const row of existingBills || []) {
        const scope = normalizeBillScope(row.bill_scope);
        if (scope === "lease" && row.lease_agreement_id === leaseAgreementId) {
          existingKeys.add(buildLeaseBillIdentityKey(row.bill_type, row.due_date));
        }
        if (scope === "tenant" && row.tenant_id && leaseContext.tenantIds.includes(row.tenant_id)) {
          existingKeys.add(buildLeaseBillIdentityKey(row.bill_type, row.due_date));
        }
      }

      const draftsToInsert = drafts.filter((draft) => !existingKeys.has(draft.key));
      const skipped = drafts.length - draftsToInsert.length;

      if (!draftsToInsert.length) {
        return NextResponse.json({
          created: 0,
          skipped,
          rentBillsCreated: 0,
          securityDepositCreated: false,
          message: "All lease bills for this term already exist or conflict with tenant-specific obligations.",
        });
      }

      const insertRows = draftsToInsert.map((draft) => ({
        property_id: propertyId,
        tenant_id: null,
        lease_agreement_id: leaseAgreementId,
        bill_scope: "lease",
        bill_type: draft.billType,
        description: draft.description,
        amount: draft.amount,
        due_date: draft.dueDate,
        status: "due",
        notify_tenant: false,
        month: draft.month,
        year: draft.year,
      }));

      const { data: insertedBills, error: insertError } = await supabaseAdmin
        .from("tenant_bills")
        .insert(insertRows)
        .select("id, bill_type");

      if (insertError) {
        if (String(insertError.message || "").includes("uniq_tenant_bills_lease_rent_security_active")) {
          return NextResponse.json(
            { error: "A lease-level rent or security deposit bill already exists for one of the selected due dates." },
            { status: 409 }
          );
        }
        throw insertError;
      }

      const rentBillsCreated = (insertedBills || []).filter((row: any) => row.bill_type === "rent").length;
      const securityDepositCreated = (insertedBills || []).some((row: any) => row.bill_type === "security_deposit");

      return NextResponse.json({
        created: insertedBills?.length || 0,
        skipped,
        rentBillsCreated,
        securityDepositCreated,
        message: "Lease bills generated.",
      });
    }

    const propertyId = String(body?.propertyId || "").trim();
    const tenantId = String(body?.tenantId || "").trim();
    const leaseAgreementId = String(body?.leaseAgreementId || "").trim();
    const billScope = normalizeBillScope(body?.billScope);
    const billType = String(body?.billType || "").trim().toLowerCase();
    const description = body?.description;
    const notifyTenant = !!body?.notifyTenant;
    const paymentLinkUrl = body?.paymentLinkUrl;

    if (!propertyId || !billType || !body?.dueDate) {
      return NextResponse.json({ error: "propertyId, billType, and dueDate are required" }, { status: 400 });
    }
    if (!isValidBillType(billType)) {
      return NextResponse.json({ error: `billType must be one of ${BILL_TYPES.join(", ")}` }, { status: 400 });
    }

    const parsedAmount = parsePositiveAmount(body?.amount);
    if (!parsedAmount) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    if (billScope === "tenant") {
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId is required for tenant-specific bills" }, { status: 400 });
      }
      const isAssigned = await validateTenantAssignment(propertyId, tenantId);
      if (!isAssigned) {
        return NextResponse.json({ error: "Selected tenant is not linked to the selected property" }, { status: 400 });
      }
    } else {
      if (!leaseAgreementId) {
        return NextResponse.json({ error: "leaseAgreementId is required for lease-level bills" }, { status: 400 });
      }
      const leaseContext = await loadLeaseAgreementContext(propertyId, leaseAgreementId);
      if ("error" in leaseContext && leaseContext.error) {
        return NextResponse.json({ error: leaseContext.error }, { status: 400 });
      }
    }

    const payload = buildBillPayload({
      propertyId,
      tenantId: billScope === "tenant" ? tenantId : null,
      leaseAgreementId: billScope === "lease" ? leaseAgreementId : null,
      billScope,
      billType,
      description,
      amount: parsedAmount,
      dueDate: body?.dueDate,
      notifyTenant,
      paymentLinkUrl,
    });

    if (!payload) {
      return NextResponse.json({ error: "dueDate must be a valid date" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("tenant_bills").insert(payload).select().single();
    if (error) throw error;

    return NextResponse.json({ bill: data });
  } catch (error) {
    console.error("Error creating tenant bill:", error);
    return NextResponse.json({ error: "Failed to create tenant bill" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, action, voidReason } = body || {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

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

    const { data: existingBill, error: existingBillError } = await supabaseAdmin
      .from("tenant_bills")
      .select("id, property_id, tenant_id, lease_agreement_id, bill_scope, bill_type, due_date, amount, status")
      .eq("id", id)
      .maybeSingle();
    if (existingBillError) throw existingBillError;
    if (!existingBill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      if (!BILL_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of ${BILL_STATUSES.join(", ")}` }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_date = toDateOnlyString(new Date().toISOString());
      } else if (existingBill.status === "paid") {
        updates.paid_date = null;
      }
    }

    if (body.amount !== undefined) {
      const parsedAmount = parseFloat(body.amount);
      if (!Number.isFinite(parsedAmount)) {
        return NextResponse.json({ error: "amount must be a valid number" }, { status: 400 });
      }
      updates.amount = parsedAmount;
      if (parsedAmount === 0) {
        updates.status = "voided";
        updates.voided_at = new Date().toISOString();
        updates.voided_by = user.id;
        updates.voided_reason = "Auto-voided: amount set to $0";
      }
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.billType !== undefined) {
      const billType = String(body.billType || "").trim().toLowerCase();
      if (!isValidBillType(billType)) {
        return NextResponse.json({ error: `billType must be one of ${BILL_TYPES.join(", ")}` }, { status: 400 });
      }
      updates.bill_type = billType;
    }

    let normalizedDueDate = existingBill.due_date;
    if (body.dueDate !== undefined) {
      const due = getNormalizedDueDateParts(body.dueDate);
      if (!due) {
        return NextResponse.json({ error: "dueDate must be a valid date" }, { status: 400 });
      }
      normalizedDueDate = due.normalized;
      updates.due_date = due.normalized;
      updates.month = due.parts.month;
      updates.year = due.parts.year;
    }

    const nextPropertyId = body.propertyId !== undefined ? String(body.propertyId || "").trim() : existingBill.property_id;
    const nextBillScope = body.billScope !== undefined ? normalizeBillScope(body.billScope) : normalizeBillScope(existingBill.bill_scope);
    const nextTenantId = body.tenantId !== undefined ? String(body.tenantId || "").trim() : String(existingBill.tenant_id || "").trim();
    const nextLeaseAgreementId =
      body.leaseAgreementId !== undefined ? String(body.leaseAgreementId || "").trim() : String(existingBill.lease_agreement_id || "").trim();

    if (!nextPropertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    updates.property_id = nextPropertyId;
    updates.bill_scope = nextBillScope;

    if (nextBillScope === "tenant") {
      if (!nextTenantId) {
        return NextResponse.json({ error: "tenantId is required for tenant-specific bills" }, { status: 400 });
      }
      const isAssigned = await validateTenantAssignment(nextPropertyId, nextTenantId);
      if (!isAssigned) {
        return NextResponse.json({ error: "Selected tenant is not linked to the selected property" }, { status: 400 });
      }
      updates.tenant_id = nextTenantId;
      updates.lease_agreement_id = null;
    } else {
      if (!nextLeaseAgreementId) {
        return NextResponse.json({ error: "leaseAgreementId is required for lease-level bills" }, { status: 400 });
      }
      const leaseContext = await loadLeaseAgreementContext(nextPropertyId, nextLeaseAgreementId);
      if ("error" in leaseContext && leaseContext.error) {
        return NextResponse.json({ error: leaseContext.error }, { status: 400 });
      }
      updates.tenant_id = null;
      updates.lease_agreement_id = nextLeaseAgreementId;
      updates.notify_tenant = false;
    }

    if (body.paymentLinkUrl !== undefined) {
      updates.payment_link_url = body.paymentLinkUrl || null;
    }
    if (body.invoiceUrl !== undefined) {
      updates.invoice_url = body.invoiceUrl || null;
    }

    if (nextBillScope === "lease") {
      const nextBillType = String(updates.bill_type || existingBill.bill_type || "").trim().toLowerCase();
      if (["rent", "security_deposit"].includes(nextBillType) && updates.status !== "voided") {
        const { data: conflict } = await supabaseAdmin
          .from("tenant_bills")
          .select("id")
          .eq("bill_scope", "lease")
          .eq("lease_agreement_id", nextLeaseAgreementId)
          .eq("bill_type", nextBillType)
          .eq("due_date", normalizedDueDate)
          .neq("status", "voided")
          .neq("id", id)
          .maybeSingle();
        if (conflict) {
          return NextResponse.json(
            { error: "A lease-level bill with this type and due date already exists for the selected lease." },
            { status: 409 }
          );
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("tenant_bills")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (body.status === "paid" && existingBill.status !== "paid") {
      await sendManualTenantBillPaidConfirmation(id);
    }

    return NextResponse.json({ bill: data });
  } catch (error) {
    console.error("Error updating tenant bill:", error);
    return NextResponse.json({ error: "Failed to update tenant bill" }, { status: 500 });
  }
}

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

    const { error } = await supabaseAdmin.from("tenant_bills").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Error deleting tenant bill:", error);
    return NextResponse.json({ error: "Failed to delete tenant bill" }, { status: 500 });
  }
}
