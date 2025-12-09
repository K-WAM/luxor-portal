// app/api/admin/documents/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GET /api/admin/documents - Admin sees ALL documents
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    console.error("GET /api/admin/documents error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}