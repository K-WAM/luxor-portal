import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'
import { getAuthContext, isAdmin } from '@/lib/auth/route-helpers'
import { buildInviteUrl } from '@/lib/invite-url'

const INVITE_LIFETIME_HOURS = 72;

const buildInviteExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + INVITE_LIFETIME_HOURS);
  return expiresAt.toISOString();
};

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

    const nowIso = new Date().toISOString();
    const stalePendingIds = (data || [])
      .filter((invite: any) => invite.status === 'pending' && invite.expires_at && invite.expires_at < nowIso)
      .map((invite: any) => invite.id);

    if (stalePendingIds.length > 0) {
      const { error: expireError } = await supabaseAdmin
        .from('tenant_invites')
        .update({ status: 'expired' })
        .in('id', stalePendingIds);
      if (expireError) throw expireError;

      (data || []).forEach((invite: any) => {
        if (stalePendingIds.includes(invite.id)) invite.status = 'expired';
      });
    }

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
    const { email, propertyId, role: requestedRole = 'tenant', ownershipPercentage, phone, name, phoneE164 } = body

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

    const expiresAt = buildInviteExpiry()

    // Check if an active invite already exists
    const { data: existing } = await supabaseAdmin
      .from('tenant_invites')
      .select('*')
      .eq('email', email)
      .eq('property_id', propertyId)
      .eq('role', requestedRole)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
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
      expires_at: expiresAt,
      status: 'pending',
    }

    if (phone) {
      insertData.phone = String(phone).trim();
    }
    if (phoneE164) {
      const trimmedE164 = String(phoneE164).trim();
      if (/^\+[1-9]\d{1,14}$/.test(trimmedE164)) {
        insertData.phone_e164 = trimmedE164;
      }
    }
    if (name) {
      insertData.name = String(name).trim();
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
          phone: phone ? String(phone).trim() : null,
          phone_e164:
            phoneE164 && /^\+[1-9]\d{1,14}$/.test(String(phoneE164).trim())
              ? String(phoneE164).trim()
              : null,
          name: name ? String(name).trim() : null,
          status: 'pending',
          expires_at: expiresAt,
          accepted_at: null,
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

      const inviteUrl = buildInviteUrl(token);
      return NextResponse.json({ ...updated, inviteUrl });
    }

    if (error) throw error;

    const inviteUrl = buildInviteUrl(token);

    return NextResponse.json({ ...data, inviteUrl });
  } catch (error) {
    console.error('Error creating invite:', error);
    const message =
      (error as any)?.message ||
      (error as any)?.error_description ||
      (error as any)?.hint ||
      "Failed to create invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH - Regenerate/reissue an invite (admin only)
export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const { id, action } = body || {}

    if (!id) {
      return NextResponse.json({ error: 'Invite ID required' }, { status: 400 })
    }

    if (action !== 'regenerate') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('tenant_invites')
      .select(`
        *,
        properties (
          id,
          address
        )
      `)
      .eq('id', id)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    if (invite.status === 'accepted') {
      return NextResponse.json({ error: 'Accepted invites cannot be regenerated' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = buildInviteExpiry()

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('tenant_invites')
      .update({
        token,
        status: 'pending',
        expires_at: expiresAt,
        accepted_at: null,
      })
      .eq('id', id)
      .select(`
        *,
        properties (
          id,
          address
        )
      `)
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ ...updated, inviteUrl: buildInviteUrl(token) })
  } catch (error) {
    console.error('Error regenerating invite:', error)
    return NextResponse.json({ error: 'Failed to regenerate invite' }, { status: 500 })
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
