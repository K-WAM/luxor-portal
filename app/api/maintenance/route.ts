import { NextResponse } from 'next/server'
import nodemailer from "nodemailer";
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers'

const TIME_BLOCKS = new Set(["morning", "midday", "afternoon", "evening"]);

type AvailabilityOption = { date: string; window: string };
type SchedulingDetails = {
  availability_options: AvailabilityOption[];
  is_flexible: boolean;
  vendor_can_enter_without_tenant: boolean;
  confirmed?: {
    date: string;
    window: string;
    note?: string;
    source: "proposed" | "custom";
    confirmed_at: string;
  } | null;
};

const normalizeSchedulingDetails = (value: any): SchedulingDetails | null => {
  if (!value || typeof value !== "object") return null;
  const options = Array.isArray(value.availability_options)
    ? value.availability_options
        .map((item: any) => ({
          date: String(item?.date || ""),
          window: String(item?.window || "").toLowerCase(),
        }))
        .filter((item: any) => item.date && TIME_BLOCKS.has(item.window))
    : [];
  const isFlexible = !!value.is_flexible;
  const vendorAccess = !!value.vendor_can_enter_without_tenant;
  const confirmedRaw = value.confirmed;
  const confirmed =
    confirmedRaw &&
    typeof confirmedRaw === "object" &&
    String(confirmedRaw.date || "") &&
    TIME_BLOCKS.has(String(confirmedRaw.window || "").toLowerCase())
      ? {
          date: String(confirmedRaw.date),
          window: String(confirmedRaw.window).toLowerCase(),
          note: confirmedRaw.note ? String(confirmedRaw.note) : "",
          source: (confirmedRaw.source === "custom" ? "custom" : "proposed") as "custom" | "proposed",
          confirmed_at: confirmedRaw.confirmed_at ? String(confirmedRaw.confirmed_at) : new Date().toISOString(),
        }
      : null;

  return {
    availability_options: options,
    is_flexible: isFlexible,
    vendor_can_enter_without_tenant: vendorAccess,
    confirmed,
  };
};

/**
 * Send a maintenance request notification email.
 * Uses Resend REST API. Requires RESEND_API_KEY env var.
 * MAINTENANCE_EMAIL_TO defaults to connect@luxordev.com if not set.
 * Failures are non-fatal — they are logged but do not fail the request.
 */
async function sendMaintenanceEmail(params: {
  propertyAddress: string;
  tenantName: string;
  tenantEmail: string;
  category: string;
  description: string;
  requestId: string;
  schedulingDetails?: SchedulingDetails | null;
  createdAt?: string;
}) {
  const to = process.env.MAINTENANCE_EMAIL_TO || 'connect@luxordev.com';
  const createdAtLabel = params.createdAt
    ? new Date(params.createdAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC"
    : new Date().toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
  const categoryLabel = params.category
    ? params.category.charAt(0).toUpperCase() + params.category.slice(1)
    : 'General';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #f8fafc; letter-spacing: -0.01em;">
          Maintenance Request Logged
        </h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 28px 32px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; width: 140px; vertical-align: top;">Created</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">${createdAtLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; width: 140px; vertical-align: top;">Property</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 500; color: #0f172a;">${params.propertyAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">Tenant</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">${params.tenantName} &lt;${params.tenantEmail}&gt;</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">Category</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">${categoryLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top; border-top: 1px solid #f1f5f9;">Description</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9; white-space: pre-wrap;">${params.description}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">Request ID</td>
            <td style="padding: 8px 0; font-size: 12px; color: #94a3b8; font-family: monospace;">${params.requestId}</td>
          </tr>
          ${
            params.schedulingDetails
              ? `
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top; border-top: 1px solid #f1f5f9;">Availability</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; border-top: 1px solid #f1f5f9;">
              ${params.schedulingDetails.availability_options
                .map((opt, idx) => `${idx + 1}. ${opt.date} (${opt.window})`)
                .join("<br/>")}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">Flexible</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">${params.schedulingDetails.is_flexible ? "Yes" : "No"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; vertical-align: top;">Vendor access if tenant absent</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">${params.schedulingDetails.vendor_can_enter_without_tenant ? "Yes" : "No"}</td>
          </tr>
            `
              : ""
          }
        </table>
      </div>
    </div>
  `;

  const apiKey = process.env.RESEND_API_KEY;
  try {
    if (apiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Luxor Maintenance <noreply@luxordev.com>',
          to: [to],
          subject: 'Maintenance request logged',
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('[maintenance email] Resend error:', err);
      }
      return;
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 0);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !port || !user || !pass || !from) {
      console.warn('[maintenance email] No provider configured (missing RESEND_API_KEY and SMTP vars)');
      return;
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to,
      subject: 'Maintenance request logged',
      html,
    });
  } catch (err) {
    console.error('[maintenance email] Failed to send:', err);
  }
}

async function sendTenantScheduleEmail(params: {
  tenantEmail: string;
  tenantName: string;
  propertyAddress: string;
  category: string;
  description: string;
  confirmedDate: string;
  confirmedWindow: string;
  vendorCanEnterWithoutTenant: boolean;
  note?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!params.tenantEmail) return;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #0f172a; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Maintenance Visit Scheduled</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 28px 32px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0;">Hi ${params.tenantName || "there"},</p>
        <p>Your maintenance request has been scheduled.</p>
        <p><strong>Property:</strong> ${params.propertyAddress}</p>
        <p><strong>Issue:</strong> ${params.category || "General"} — ${params.description}</p>
        <p><strong>Expected vendor time:</strong> ${params.confirmedDate} (${params.confirmedWindow})</p>
        <p><strong>Vendor access if tenant not home:</strong> ${params.vendorCanEnterWithoutTenant ? "Yes" : "No"}</p>
        ${params.note ? `<p><strong>Note:</strong> ${params.note}</p>` : ""}
      </div>
    </div>
  `;

  try {
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Luxor Maintenance <noreply@luxordev.com>",
          to: [params.tenantEmail],
          subject: "Maintenance visit scheduled",
          html,
        }),
      });
      if (res.ok) {
        return;
      }

      const err = await res.text();
      console.error("[maintenance email] Resend tenant schedule email error:", err);
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 0);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !port || !user || !pass || !from) {
      console.warn("[maintenance email] No provider configured for tenant schedule email");
      return;
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: params.tenantEmail,
      subject: "Maintenance visit scheduled",
      html,
    });
  } catch (err) {
    console.error("[maintenance email] Failed to send tenant schedule email:", err);
  }
}

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let data, error

    // Admin: no filter, show all requests
    if (isAdmin(role)) {
      const result = await supabaseAdmin
        .from('maintenance_requests')
        .select(`
          *,
          properties (
            address
          )
        `)
        .order('created_at', { ascending: false })

      data = result.data
      error = result.error
    } else {
      const propertyIds = await getAccessiblePropertyIds(user.id, role)
      if (!propertyIds.length) return NextResponse.json([])

      let query = supabaseAdmin
        .from('maintenance_requests')
        .select(`
          *,
          properties (
            address
          )
        `)
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false })

      if (role === "tenant") {
        const tenantEmail = user.email || ""
        if (tenantEmail) {
          query = query.eq("tenant_email", tenantEmail)
        }
      }

      const result = await query
      data = result.data
      error = result.error
    }

    if (error) throw error

    // Handle null/undefined data
    if (!data) {
      return NextResponse.json([])
    }

    // Convert snake_case to camelCase for frontend
    const formatted = data.map(item => ({
      id: item.id,
      propertyId: item.property_id,
      tenantName: item.tenant_name,
      tenantEmail: item.tenant_email,
      category: item.category,
      description: item.description,
      status: item.status,
      internalComments: item.internal_comments,
      cost: item.cost,
      createdAt: item.created_at,
      closedAt: item.closed_at,
      propertyAddress: item.properties?.address,
      attachments: item.attachments || [],
      schedulingDetails: normalizeSchedulingDetails(item.scheduling_details),
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Error fetching maintenance requests:', error)
    return NextResponse.json({ error: 'Failed to fetch maintenance requests' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const schedulingDetails = normalizeSchedulingDetails(body.schedulingDetails)

    // Only allow admins or users posting for their own property
    if (!isAdmin(role)) {
      const allowedProps = await getAccessiblePropertyIds(user.id, role)
      if (!allowedProps.includes(body.propertyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const tenantEmail =
      role === "tenant" ? user.email || "" : body.tenantEmail
    const tenantName =
      role === "tenant"
        ? user.user_metadata?.name || body.tenantName || "Tenant"
        : body.tenantName

    if (role === "tenant" && !tenantEmail) {
      return NextResponse.json({ error: "Tenant email is required" }, { status: 400 })
    }

    if (role === "tenant") {
      if (!schedulingDetails || schedulingDetails.availability_options.length !== 3) {
        return NextResponse.json({ error: "Three availability options are required" }, { status: 400 })
      }
      const seen = new Set<string>()
      for (const option of schedulingDetails.availability_options) {
        if (!option.date || !TIME_BLOCKS.has(option.window)) {
          return NextResponse.json({ error: "Each availability option must include date and valid time block" }, { status: 400 })
        }
        const key = `${option.date}|${option.window}`
        if (seen.has(key)) {
          return NextResponse.json({ error: "Availability options must be unique" }, { status: 400 })
        }
        seen.add(key)
      }
    }

    const insertData: any = {
      property_id: body.propertyId,
      tenant_name: tenantName,
      tenant_email: tenantEmail,
      category: body.category,
      description: body.description,
      status: 'open',
      scheduling_details: schedulingDetails,
    }

    // Add optional fields if provided
    if (body.cost !== undefined) insertData.cost = body.cost
    if (body.internalComments) insertData.internal_comments = body.internalComments
    if (body.attachments) insertData.attachments = body.attachments

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    // Fetch property address for the email (non-fatal if it fails)
    let propertyAddress = body.propertyId || '';
    try {
      const { data: propData } = await supabaseAdmin
        .from('properties')
        .select('address')
        .eq('id', body.propertyId)
        .single();
      if (propData?.address) propertyAddress = propData.address;
    } catch {
      // ignore
    }

    // Send notification email (non-blocking, non-fatal)
    sendMaintenanceEmail({
      propertyAddress,
      tenantName: tenantName || 'Unknown',
      tenantEmail: tenantEmail || '',
      category: body.category || '',
      description: body.description || '',
      requestId: data?.id || '',
      schedulingDetails,
      createdAt: data?.created_at || new Date().toISOString(),
    }).catch(() => { /* already logged inside */ });

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating maintenance request:', error)
    return NextResponse.json({ error: 'Failed to create maintenance request' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const {
      id,
      status,
      internalComments,
      cost,
      propertyId,
      tenantName,
      tenantEmail,
      category,
      description,
      createdAt,
      closedAt,
      schedulingDetails,
      sendConfirmationEmail,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const updateData: any = {}
    if (status) {
      updateData.status = status
      if (status === 'closed' || status === 'completed' || status === 'cancelled') {
        updateData.closed_at = new Date().toISOString()
      }
    }
    if (internalComments !== undefined) updateData.internal_comments = internalComments
    if (cost !== undefined) updateData.cost = cost
    if (propertyId !== undefined) updateData.property_id = propertyId
    if (tenantName !== undefined) updateData.tenant_name = tenantName
    if (tenantEmail !== undefined) updateData.tenant_email = tenantEmail
    if (category !== undefined) updateData.category = category
    if (description !== undefined) updateData.description = description
    if (createdAt !== undefined) {
      if (createdAt) {
        updateData.created_at = createdAt
      }
    }
    if (closedAt !== undefined) {
      if (closedAt === null || closedAt === '') {
        updateData.closed_at = null
      } else {
        updateData.closed_at = closedAt
      }
    }
    if (schedulingDetails !== undefined) {
      updateData.scheduling_details = normalizeSchedulingDetails(schedulingDetails)
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const normalizedScheduling = normalizeSchedulingDetails(data?.scheduling_details)
    if (sendConfirmationEmail && normalizedScheduling?.confirmed && data?.tenant_email) {
      let propertyAddress = data.property_id || ''
      try {
        const { data: propData } = await supabaseAdmin
          .from('properties')
          .select('address')
          .eq('id', data.property_id)
          .single();
        if (propData?.address) propertyAddress = propData.address;
      } catch {
        // ignore lookup errors
      }

      sendTenantScheduleEmail({
        tenantEmail: data.tenant_email,
        tenantName: data.tenant_name || "Tenant",
        propertyAddress,
        category: data.category || "General",
        description: data.description || "",
        confirmedDate: normalizedScheduling.confirmed.date,
        confirmedWindow: normalizedScheduling.confirmed.window,
        vendorCanEnterWithoutTenant: normalizedScheduling.vendor_can_enter_without_tenant,
        note: normalizedScheduling.confirmed.note || "",
      }).catch(() => { /* already logged */ });
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating maintenance request:', error)
    return NextResponse.json({ error: 'Failed to update maintenance request' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const { id } = body || {}

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('maintenance_requests')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting maintenance request:', error)
    return NextResponse.json({ error: 'Failed to delete maintenance request' }, { status: 500 })
  }
}

