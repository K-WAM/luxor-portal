import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\d\s.-]{7,}$/;

const isValidPhone = (value: string) => {
  if (!PHONE_REGEX.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

const isMissingColumnError = (error: any) =>
  error?.code === "42703" || /(zelle|stripe_connected_account_id)/i.test(error?.message || "");

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("id, address, owner_name, zelle_email, zelle_phone, zelle_recipient, stripe_connected_account_id")
      .order("address", { ascending: true });

    let rowsData: any[] = (data as any[]) || [];
    let warning: string | null = null;

    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const fallback = await supabaseAdmin
        .from("properties")
        .select("id, address, owner_name")
        .order("address", { ascending: true });
      if (fallback.error) throw fallback.error;
      rowsData = (fallback.data as any[]) || [];
      warning =
        "Property payment-detail fields are not available yet. Run the latest properties migration to enable Zelle and Stripe storage.";
    }

    const rows = rowsData.map((row: any) => ({
      propertyId: row.id,
      propertyAddress: row.address || "",
      recipient: row.zelle_recipient || row.owner_name || "",
      zelleEmail: row.zelle_email || null,
      zellePhone: row.zelle_phone || null,
      stripeConnectedAccountId: row.stripe_connected_account_id || "",
    }));

    return NextResponse.json({ rows, warning });
  } catch (error) {
    console.error("Error fetching owner billing details:", error);
    return NextResponse.json(
      { error: "Failed to fetch owner billing details" },
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
    const { propertyId, zelleType, zelleValue, zelleRecipient, stripeConnectedAccountId } = body || {};

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    if (zelleValue && zelleType !== "email" && zelleType !== "phone") {
      return NextResponse.json(
        { error: "zelleType must be email or phone" },
        { status: 400 }
      );
    }

    const trimmedZelle = typeof zelleValue === "string" ? zelleValue.trim() : "";
    if (trimmedZelle) {
      if (zelleType === "email" && !EMAIL_REGEX.test(trimmedZelle)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
      if (zelleType === "phone" && !isValidPhone(trimmedZelle)) {
        return NextResponse.json({ error: "Invalid phone format" }, { status: 400 });
      }
    }

    const recipientTrimmed =
      typeof zelleRecipient === "string" ? zelleRecipient.trim() : "";
    const stripeAccountTrimmed =
      typeof stripeConnectedAccountId === "string" ? stripeConnectedAccountId.trim() : "";

    if (stripeAccountTrimmed && !stripeAccountTrimmed.startsWith("acct_")) {
      return NextResponse.json(
        { error: 'Stripe Account ID must start with "acct_".' },
        { status: 400 }
      );
    }

    const updateData = {
      zelle_email: zelleType === "email" && trimmedZelle ? trimmedZelle : null,
      zelle_phone: zelleType === "phone" && trimmedZelle ? trimmedZelle : null,
      zelle_recipient: recipientTrimmed || null,
      stripe_connected_account_id: stripeAccountTrimmed || null,
    };

    const { data, error } = await supabaseAdmin
      .from("properties")
      .update(updateData)
      .eq("id", propertyId)
      .select("id, address, owner_name, zelle_email, zelle_phone, zelle_recipient, stripe_connected_account_id")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating owner billing details:", error);
    return NextResponse.json(
      { error: "Failed to update owner billing details" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("properties")
      .update({
        zelle_email: null,
        zelle_phone: null,
        zelle_recipient: null,
        stripe_connected_account_id: null,
      })
      .eq("id", propertyId);

    if (error) throw error;

    return NextResponse.json({ success: true, cleared: { propertyId } });
  } catch (error) {
    console.error("Error deleting owner billing details:", error);
    return NextResponse.json(
      { error: "Failed to delete owner billing details" },
      { status: 500 }
    );
  }
}
