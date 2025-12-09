// app/api/documents/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GET /api/documents?propertyId=123&role=owner
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const role = searchParams.get("role") || "owner";

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    // Visibility logic
    let allowedVisibility: string[] = [];

    if (role === "admin") {
      allowedVisibility = ["admin", "owner", "tenant", "all"];
    } else if (role === "owner") {
      allowedVisibility = ["owner", "all"];
    } else {
      allowedVisibility = ["tenant", "all"];
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
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

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    console.error("GET /api/documents error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

// POST /api/documents - Upload a new document
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const propertyId = formData.get("property_id") as string | null;
    const title = (formData.get("title") as string | null) || "";
    const visibility = (formData.get("visibility") as string | null) || "owner";

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: "Missing property_id" },
        { status: 400 }
      );
    }

    const safeTitle = title.trim() || file.name;

    // 1) Upload to Supabase Storage
    const ext = file.name.split(".").pop();
    const timestamp = Date.now();
    const sanitizedTitle = safeTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const filePath = `${propertyId}/${timestamp}-${sanitizedTitle}.${ext || "pdf"}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("luxor-documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    // 2) Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("luxor-documents").getPublicUrl(filePath);

    // 3) Insert into documents table
    const { data: doc, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        property_id: propertyId,
        title: safeTitle,
        file_url: publicUrl,
        file_type: file.type || "application/octet-stream",
        storage_path: filePath,
        visibility: visibility,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Supabase insert error (documents):", insertError);
      return NextResponse.json(
        { error: "Failed to save document record" },
        { status: 500 }
      );
    }

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/documents:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}