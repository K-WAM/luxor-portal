import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'
import { getAuthContext, isAdmin } from '@/lib/auth/route-helpers'

// GET - Fetch all invites (admin only)
export async function GET() {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_invites')
      .select(`
        *,
        properties (
          id,
          address
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching invites:', error)
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }
}

// POST - Create a new invite (admin only)
export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const { email, propertyId, role: requestedRole = 'tenant', ownershipPercentage } = body

    const allowedRoles = ['tenant', 'owner', 'admin', 'viewer']

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!allowedRoles.includes(requestedRole)) {
      return NextResponse.json(
        { error: 'Role must be one of tenant, owner, admin, or viewer' },
        { status: 400 }
      )
    }

    // property required (schema requires property_id)
    if (!propertyId) {
      return NextResponse.json(
        { error: 'Property is required for this invite' },
        { status: 400 }
      )
    }

    // Validate ownership percentage for owners
    if (requestedRole === 'owner') {
      if (ownershipPercentage === undefined || ownershipPercentage === null || ownershipPercentage === '') {
        return NextResponse.json(
          { error: 'Ownership percentage is required for owners' },
          { status: 400 }
        )
      }
      const percentage = parseFloat(ownershipPercentage)
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return NextResponse.json(
          { error: 'Ownership percentage must be between 0.01 and 100' },
          { status: 400 }
        )
      }
    }

    // Generate a secure random token
    const token = randomBytes(32).toString('hex')

    // Set expiration to 72 hours from now
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 72)

    // Check if an active invite already exists
    const { data: existing } = await supabaseAdmin
      .from('tenant_invites')
      .select('*')
      .eq('email', email)
      .eq('status', 'pending')
      .single()

    if (existing && (existing.role === requestedRole) && (existing.property_id === propertyId || !propertyId)) {
      return NextResponse.json(
        { error: 'An active invite already exists for this email' },
        { status: 400 }
      )
    }

    const insertData: any = {
      email,
      property_id: propertyId,
      role: requestedRole,
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    }

    // Add ownership percentage only for owners
    if (requestedRole === 'owner' && ownershipPercentage) {
      insertData.ownership_percentage = parseFloat(ownershipPercentage)
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_invites')
      .insert(insertData)
      .select(`
        *,
        properties (
          id,
          address
        )
      `)
      .single()

    // Handle duplicate invite (unique constraint on email + property)
    if (error?.code === '23505') {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tenant_invites')
        .update({
          role: requestedRole,
          token,
          ownership_percentage: requestedRole === 'owner' && ownershipPercentage ? parseFloat(ownershipPercentage) : null,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .eq('email', email)
        .eq('property_id', propertyId)
        .select(`
          *,
          properties (
            id,
            address
          )
        `)
        .single();

      if (updateError) throw updateError;

      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${token}`;
      return NextResponse.json({ ...updated, inviteUrl });
    }

    if (error) throw error;

    // Generate invite URL
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${token}`;

    return NextResponse.json({ ...data, inviteUrl });
  } catch (error) {
    console.error('Error creating invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}

// DELETE - Delete/cancel an invite (admin only)
export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Invite ID required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('tenant_invites')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invite:', error)
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 })
  }
}
