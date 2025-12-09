// app/api/properties/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GET /api/properties  -> return all properties (used by owner page & admin docs dropdown)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET /properties error:", error);
      return NextResponse.json(
        { error: "Failed to load properties" },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("Unexpected GET /properties error:", err);
    return NextResponse.json(
      { error: "Failed to load properties" },
      { status: 500 }
    );
  }
}

// POST /api/properties  -> create a new property from the JSON body
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { data, error } = await supabaseAdmin
      .from("properties")
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error("Supabase POST /properties error:", error);
      return NextResponse.json(
        { error: "Failed to create property" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Unexpected POST /properties error:", err);
    return NextResponse.json(
      { error: "Failed to create property" },
      { status: 500 }
    );
  }
}
