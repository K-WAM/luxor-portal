import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAccessiblePropertyIds, getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const STORAGE_BUCKET = "property-documents";
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "video/mp4",
  "video/quicktime",
]);

type UploadedAttachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

const safeFileName = (name: string) => name.replace(/[^\w.\-]+/g, "_");

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const propertyId = (formData.get("propertyId") as string) || "";
    const files = formData.getAll("files") as File[];

    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (!isAdmin(role)) {
      const allowedProps = await getAccessiblePropertyIds(user.id, role);
      if (!allowedProps.includes(propertyId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `File exceeds ${MAX_FILE_MB} MB limit` }, { status: 400 });
      }
    }

    const uploaded: UploadedAttachment[] = [];

    for (const file of files) {
      const extension = file.name.split(".").pop() || "bin";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFileName(file.name)}`;
      const storagePath = `${propertyId}/maintenance/${fileName}.${extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      uploaded.push({
        url: publicUrl,
        name: file.name,
        type: file.type,
        size: file.size,
      });
    }

    return NextResponse.json({ attachments: uploaded });
  } catch (error: any) {
    console.error("Error uploading maintenance attachments:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload attachments" },
      { status: 500 }
    );
  }
}
