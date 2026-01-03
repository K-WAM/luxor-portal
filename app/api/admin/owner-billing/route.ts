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
  error?.code === "42703" || /zelle/i.test(error?.message || "");

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("user_properties")
      .select(
        `
        user_id,
        property_id,
        ownership_percentage,
        zelle_email,
        zelle_phone,
        properties (
          id,
          address
        )
      `
      )
      .eq("role", "owner");

    let rowsData = data || [];
    let warning: string | null = null;

    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const fallback = await supabaseAdmin
        .from("user_properties")
        .select(
          `
          user_id,
          property_id,
          ownership_percentage,
          properties (
            id,
            address
          )
        `
        )
        .eq("role", "owner");

      if (fallback.error) throw fallback.error;
      rowsData = fallback.data || [];
      warning =
        "Zelle fields are not available yet. Run the user_properties migration to enable Zelle storage.";
    }

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const userEmailMap = new Map<string, string>();
    (usersData?.users || []).forEach((u) => {
      if (u.id) userEmailMap.set(u.id, u.email || "");
    });

    const getPropertyAddress = (properties: any) => {
      if (!properties) return "";
      if (Array.isArray(properties)) {
        return properties[0]?.address || "";
      }
      return properties.address || "";
    };

    const rows = rowsData.map((row: any) => ({
      userId: row.user_id,
      ownerEmail: userEmailMap.get(row.user_id) || "",
      propertyId: row.property_id,
      propertyAddress: getPropertyAddress(row.properties),
      ownershipPercentage: row.ownership_percentage ?? null,
      zelleEmail: row.zelle_email || null,
      zellePhone: row.zelle_phone || null,
    }));

    rows.sort((a, b) => {
      if (a.propertyAddress !== b.propertyAddress) {
        return a.propertyAddress.localeCompare(b.propertyAddress);
      }
      return a.ownerEmail.localeCompare(b.ownerEmail);
    });

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
    const { userId, propertyId, zelleType, zelleValue } = body || {};

    if (!userId || !propertyId) {
      return NextResponse.json(
        { error: "userId and propertyId are required" },
        { status: 400 }
      );
    }

    if (zelleValue && zelleType !== "email" && zelleType !== "phone") {
      return NextResponse.json(
        { error: "zelleType must be email or phone" },
        { status: 400 }
      );
    }

    const trimmed = typeof zelleValue === "string" ? zelleValue.trim() : "";
    if (trimmed) {
      if (zelleType === "email" && !EMAIL_REGEX.test(trimmed)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
      if (zelleType === "phone" && !isValidPhone(trimmed)) {
        return NextResponse.json({ error: "Invalid phone format" }, { status: 400 });
      }
    }

    const updateData: { zelle_email: string | null; zelle_phone: string | null } = {
      zelle_email: null,
      zelle_phone: null,
    };

    if (trimmed) {
      if (zelleType === "email") updateData.zelle_email = trimmed;
      if (zelleType === "phone") updateData.zelle_phone = trimmed;
    }

    const { data, error } = await supabaseAdmin
      .from("user_properties")
      .update(updateData)
      .eq("user_id", userId)
      .eq("property_id", propertyId)
      .eq("role", "owner")
      .select()
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
