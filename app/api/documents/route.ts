import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE! // backend only
);

// GET /api/documents?propertyId=123&role=owner
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const role = searchParams.get("role") || "owner";

    if (!propertyId) {
      return NextResponse.json([], { status: 200 });
    }

    // Visibility logic
    let allowedVisibility: string[] = [];

    if (role === "admin") {
      allowedVisibility = ["admin", "owner", "tenant"];
    } else if (role === "owner") {
      allowedVisibility = ["owner", "tenant"];
    } else {
      allowedVisibility = ["tenant"];
    }

    const { data, error } = await supabase
      .from("documents")
      .select(`
        id,
        property_id,
        name,
        storage_path,
        visibility,
        created_at,
        properties (address)
      `)
      .eq("property_id", propertyId)
      .in("visibility", allowedVisibility)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("GET /api/documents error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
