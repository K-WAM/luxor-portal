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
    const tenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.filter(Boolean) : [];
    const notes = String(body.notes || "").trim() || null;
    const priorLeaseId = body.priorLeaseId ? String(body.priorLeaseId) : null;

    if (!propertyId || !leaseStartDate || !leaseEndDate || !monthlyRent || tenantIds.length === 0) {
      return NextResponse.json(
        { error: "Property, lease dates, monthly rent, and at least one tenant are required." },
        { status: 400 }
      );
    }

    if (leaseEndDate < leaseStartDate) {
      return NextResponse.json({ error: "Lease end date must be after lease start date." }, { status: 400 });
    }

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

    const [{ error: tenantLinkError }, { error: accessError }] = await Promise.all([
      supabaseAdmin.from("lease_agreement_tenants").insert(tenantRows),
      supabaseAdmin.from("user_properties").upsert(
        tenantIds.map((tenantId: string) => ({
          user_id: tenantId,
          property_id: propertyId,
          role: "tenant",
        })),
        { onConflict: "user_id,property_id" }
      ),
    ]);

    if (tenantLinkError) throw tenantLinkError;
    if (accessError) throw accessError;

    if (status === "active" || status === "upcoming") {
      const propertyUpdates: Record<string, any> = {
        lease_start: leaseStartDate,
        lease_end: leaseEndDate,
        target_monthly_rent: monthlyRent,
      };
      await supabaseAdmin.from("properties").update(propertyUpdates).eq("id", propertyId);
    }

    return NextResponse.json({
      leaseAgreement: insertedLease,
      suggestedRenewalStartDate: addOneDay(leaseEndDate),
    });
  } catch (error) {
    console.error("Error creating lease agreement:", error);
    return NextResponse.json({ error: "Failed to create lease agreement" }, { status: 500 });
  }
}
