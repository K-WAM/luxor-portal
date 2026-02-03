import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers'
import nodemailer from 'nodemailer'

const sendMaintenanceEmail = async (payload: {
  propertyAddress: string
  description: string
  tenantName?: string
  tenantEmail?: string
}) => {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 0)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM

  if (!host || !port || !user || !pass || !from) {
    console.warn('SMTP env vars missing; skipping maintenance email.')
    return
  }

  const baseUrl = process.env.APP_BASE_URL || ''
  const adminLink = baseUrl ? `${baseUrl.replace(/\/$/, '')}/admin/maintenance` : ''
  const lines = [
    'New Maintenance Request Submitted',
    '',
    `Property: ${payload.propertyAddress || 'Unknown property'}`,
    payload.tenantName ? `Tenant: ${payload.tenantName}` : null,
    payload.tenantEmail ? `Tenant Email: ${payload.tenantEmail}` : null,
    '',
    'Description:',
    payload.description || 'No description provided.',
    '',
    'Log in to the portal to view full details.',
    adminLink ? `Admin link: ${adminLink}` : null,
  ].filter(Boolean)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: 'connect@luxordev.com',
    subject: 'New Maintenance Request Submitted',
    text: lines.join('\n'),
  })
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
      attachments: item.attachments || []
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
    if (Array.isArray(body.attachments)) insertData.attachments = body.attachments

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    try {
      const { data: propertyData } = await supabaseAdmin
        .from('properties')
        .select('address')
        .eq('id', body.propertyId)
        .single()

      await sendMaintenanceEmail({
        propertyAddress: propertyData?.address || '',
        description: body.description,
        tenantName,
        tenantEmail,
      })
    } catch (emailError) {
      console.error('Error sending maintenance email:', emailError)
    }

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
