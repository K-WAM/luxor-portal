import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .select(`
        *,
        properties (
          address
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

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
    const body = await request.json()
    
    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .insert({
        property_id: body.propertyId,
        tenant_name: body.tenantName,
        tenant_email: body.tenantEmail,
        category: body.category,
        description: body.description,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating maintenance request:', error)
    return NextResponse.json({ error: 'Failed to create maintenance request' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status, internalComments } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const updateData: any = {}
    if (status) updateData.status = status
    if (internalComments !== undefined) updateData.internal_comments = internalComments
    if (status === 'closed') updateData.closed_at = new Date().toISOString()

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