import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers'

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
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[maintenance email] RESEND_API_KEY not set — skipping email');
    return;
  }

  const to = process.env.MAINTENANCE_EMAIL_TO || 'connect@luxordev.com';
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
        </table>
      </div>
    </div>
  `;

  try {
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
  } catch (err) {
    console.error('[maintenance email] Failed to send:', err);
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
      propertyAddress: item.properties?.address
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

    const insertData: any = {
      property_id: body.propertyId,
      tenant_name: tenantName,
      tenant_email: tenantEmail,
      category: body.category,
      description: body.description,
      status: 'open',
    }

    // Add optional fields if provided
    if (body.cost !== undefined) insertData.cost = body.cost
    if (body.internalComments) insertData.internal_comments = body.internalComments

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
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const updateData: any = {}
    if (status) {
      updateData.status = status
      if (status === 'closed') {
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

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

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
