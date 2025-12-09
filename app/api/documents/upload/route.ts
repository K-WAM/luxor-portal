import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const propertyId = formData.get("propertyId") as string | null;
    const title = (formData.get("title") as string | null) || "";
    const category = (formData.get("category") as string | null) || "other";

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: "Missing propertyId" },
        { status: 400 }
      );
    }

    const safeTitle = title.trim() || file.name;

    // 1) Upload to Supabase Storage
    const ext = file.name.split(".").pop();
    const filePath = `${propertyId}/${Date.now()}-${safeTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.${ext || "pdf"}`;

    const { error: uploadError } = await supabase.storage
      .from("property-documents")
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
    } = supabase.storage.from("property-documents").getPublicUrl(filePath);

    // 3) Insert into property_documents table
    const { data: doc, error: insertError } = await supabase
      .from("property_documents")
      .insert({
        property_id: propertyId,
        title: safeTitle,
        category,
        file_url: publicUrl,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Supabase insert error (property_documents):", insertError);
      return NextResponse.json(
        { error: "Failed to save document record" },
        { status: 500 }
      );
    }

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in /api/documents/upload:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
