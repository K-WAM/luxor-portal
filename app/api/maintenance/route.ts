import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type DbMaintenanceRow = {
  id: string;
  property_id: string | null;
  tenant_name: string;
  tenant_email: string;
  category: string | null;
  description: string;
  status: string;
  created_at: string;
};

function toCamel(row: DbMaintenanceRow) {
  return {
    id: row.id,
    propertyId: row.property_id,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

// GET: list all maintenance requests
export async function GET() {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Supabase GET error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load requests" },
      { status: 500 }
    );
  }

  const camel = (data as DbMaintenanceRow[]).map(toCamel);
  return NextResponse.json(camel, { status: 200 });
}

// POST: tenant creates a new request
export async function POST(request: Request) {
  const body = await request.json();
  const {
    propertyId,
    tenantName,
    tenantEmail,
    category,
    description,
  } = body;

  if (!tenantName || !tenantEmail || !description) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      property_id: propertyId || null,
      tenant_name: tenantName,
      tenant_email: tenantEmail,
      category: category || null,
      description,
      status: "open",
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("Supabase POST error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create request" },
      { status: 500 }
    );
  }

  return NextResponse.json(toCamel(data as DbMaintenanceRow), { status: 201 });
}

// PATCH: admin updates status
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json(
      { error: "Missing id or status" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("Supabase PATCH error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update request" },
      { status: 500 }
    );
  }

  return NextResponse.json(toCamel(data as DbMaintenanceRow), { status: 200 });
}
