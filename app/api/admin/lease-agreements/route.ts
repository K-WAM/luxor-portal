import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { toDateOnlyString } from "@/lib/date-only";
import { deriveLeaseAgreementStatus, fetchPropertyLeaseSnapshots } from "@/lib/lease-agreements";
import { supabaseAdmin } from "@/lib/supabase/server";

const addOneDay = (dateOnly: string) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const validatePropertyTenantIds = async (propertyId: string, tenantIds: string[]) => {
  const normalizedTenantIds = Array.from(
    new Set(tenantIds.map((tenantId) => String(tenantId || "").trim()).filter(Boolean))
  );

  if (!propertyId || normalizedTenantIds.length === 0) {
    return { tenantIds: normalizedTenantIds, error: "At least one tenant is required." as const };
  }

  const { data, error } = await supabaseAdmin
    .from("user_properties")
    .select("user_id")
    .eq("property_id", propertyId)
    .eq("role", "tenant")
    .in("user_id", normalizedTenantIds);

  if (error) throw error;

  const validIds = new Set((data || []).map((row: any) => String(row.user_id || "").trim()).filter(Boolean));
  const invalidIds = normalizedTenantIds.filter((tenantId) => !validIds.has(tenantId));

  if (invalidIds.length > 0) {
    return {
      tenantIds: normalizedTenantIds,
      error: "All selected tenants must already be linked to the selected property." as const,
    };
  }

  return { tenantIds: normalizedTenantIds, error: null as string | null };
};

const syncPropertyCurrentLease = async (propertyId: string) => {
  const snapshotMap = await fetchPropertyLeaseSnapshots([propertyId]);
  const snapshot = snapshotMap.get(propertyId);
  const currentLease = snapshot?.currentLease;

  await supabaseAdmin
    .from("properties")
    .update({
      lease_start: currentLease?.leaseStartDate || null,
      lease_end: currentLease?.leaseEndDate || null,
      target_monthly_rent: currentLease?.monthlyRent || null,
    })
    .eq("id", propertyId);
};

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }

    const snapshotMap = await fetchPropertyLeaseSnapshots([propertyId]);
    const snapshot = snapshotMap.get(propertyId);
    return NextResponse.json({
      currentLease: snapshot?.currentLease || null,
      agreements: snapshot?.agreements || [],
    });
  } catch (error) {
    console.error("Error fetching lease agreements:", error);
    return NextResponse.json({ error: "Failed to fetch lease agreements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const leaseStartDate = toDateOnlyString(body.leaseStartDate);
    const leaseEndDate = toDateOnlyString(body.leaseEndDate);
    const monthlyRent = Number(body.monthlyRent || 0);
    const rawTenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.filter(Boolean) : [];
    const notes = String(body.notes || "").trim() || null;
    const priorLeaseId = body.priorLeaseId ? String(body.priorLeaseId) : null;

    if (!propertyId || !leaseStartDate || !leaseEndDate || !monthlyRent || rawTenantIds.length === 0) {
      return NextResponse.json(
        { error: "Property, lease dates, monthly rent, and at least one tenant are required." },
        { status: 400 }
      );
    }

    if (leaseEndDate < leaseStartDate) {
      return NextResponse.json({ error: "Lease end date must be after lease start date." }, { status: 400 });
    }

    const tenantValidation = await validatePropertyTenantIds(propertyId, rawTenantIds);
    if (tenantValidation.error) {
      return NextResponse.json({ error: tenantValidation.error }, { status: 400 });
    }
    const tenantIds = tenantValidation.tenantIds;

    const status = deriveLeaseAgreementStatus(leaseStartDate, leaseEndDate, body.status || null);

    const { data: insertedLease, error: insertLeaseError } = await supabaseAdmin
      .from("lease_agreements")
      .insert({
        property_id: propertyId,
        lease_start_date: leaseStartDate,
        lease_end_date: leaseEndDate,
        monthly_rent: monthlyRent,
        status,
        prior_lease_id: priorLeaseId,
        notes,
      })
      .select("*")
      .single();

    if (insertLeaseError) throw insertLeaseError;

    const tenantRows = tenantIds.map((tenantId: string) => ({
      lease_agreement_id: insertedLease.id,
      user_id: tenantId,
    }));

    const { error: tenantLinkError } = await supabaseAdmin.from("lease_agreement_tenants").insert(tenantRows);

    if (tenantLinkError) {
      await supabaseAdmin.from("lease_agreements").delete().eq("id", insertedLease.id);
      throw tenantLinkError;
    }

    await syncPropertyCurrentLease(propertyId);

    return NextResponse.json({
      leaseAgreement: insertedLease,
      suggestedRenewalStartDate: addOneDay(leaseEndDate),
    });
  } catch (error) {
    console.error("Error creating lease agreement:", error);
    return NextResponse.json({ error: "Failed to create lease agreement" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const leaseAgreementId = String(body.id || body.leaseAgreementId || "").trim();
    const leaseStartDate = toDateOnlyString(body.leaseStartDate);
    const leaseEndDate = toDateOnlyString(body.leaseEndDate);
    const monthlyRent = Number(body.monthlyRent || 0);
    const rawTenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.filter(Boolean) : [];
    const notes = String(body.notes || "").trim() || null;

    if (!leaseAgreementId || !leaseStartDate || !leaseEndDate || !monthlyRent || rawTenantIds.length === 0) {
      return NextResponse.json(
        { error: "Lease, lease dates, monthly rent, and at least one tenant are required." },
        { status: 400 }
      );
    }

    if (leaseEndDate < leaseStartDate) {
      return NextResponse.json({ error: "Lease end date must be after lease start date." }, { status: 400 });
    }

    const { data: existingLease, error: existingLeaseError } = await supabaseAdmin
      .from("lease_agreements")
      .select("id, property_id, prior_lease_id")
      .eq("id", leaseAgreementId)
      .maybeSingle();

    if (existingLeaseError) throw existingLeaseError;
    if (!existingLease) {
      return NextResponse.json({ error: "Lease agreement not found." }, { status: 404 });
    }

    const propertyId = String(existingLease.property_id || "").trim();
    const tenantValidation = await validatePropertyTenantIds(propertyId, rawTenantIds);
    if (tenantValidation.error) {
      return NextResponse.json({ error: tenantValidation.error }, { status: 400 });
    }
    const tenantIds = tenantValidation.tenantIds;

    const status = deriveLeaseAgreementStatus(leaseStartDate, leaseEndDate, body.status || null);

    const { data: existingLinks, error: existingLinksError } = await supabaseAdmin
      .from("lease_agreement_tenants")
      .select("user_id")
      .eq("lease_agreement_id", leaseAgreementId);
    if (existingLinksError) throw existingLinksError;

    const existingTenantIds = new Set((existingLinks || []).map((row: any) => String(row.user_id || "").trim()).filter(Boolean));
    const nextTenantIds = new Set(tenantIds);
    const tenantIdsToAdd = tenantIds.filter((tenantId) => !existingTenantIds.has(tenantId));
    const tenantIdsToRemove = Array.from(existingTenantIds).filter((tenantId) => !nextTenantIds.has(tenantId));

    if (tenantIdsToAdd.length > 0) {
      const { error: addError } = await supabaseAdmin.from("lease_agreement_tenants").upsert(
        tenantIdsToAdd.map((tenantId) => ({
          lease_agreement_id: leaseAgreementId,
          user_id: tenantId,
        })),
        { onConflict: "lease_agreement_id,user_id" }
      );
      if (addError) throw addError;
    }

    if (tenantIdsToRemove.length > 0) {
      const { error: removeError } = await supabaseAdmin
        .from("lease_agreement_tenants")
        .delete()
        .eq("lease_agreement_id", leaseAgreementId)
        .in("user_id", tenantIdsToRemove);
      if (removeError) throw removeError;
    }

    const { data: updatedLease, error: updateError } = await supabaseAdmin
      .from("lease_agreements")
      .update({
        lease_start_date: leaseStartDate,
        lease_end_date: leaseEndDate,
        monthly_rent: monthlyRent,
        status,
        notes,
      })
      .eq("id", leaseAgreementId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await syncPropertyCurrentLease(propertyId);

    return NextResponse.json({ leaseAgreement: updatedLease });
  } catch (error) {
    console.error("Error updating lease agreement:", error);
    return NextResponse.json({ error: "Failed to update lease agreement" }, { status: 500 });
  }
}
