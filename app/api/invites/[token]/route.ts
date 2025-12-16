import { NextResponse, NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

// GET - Validate and fetch invite details by token
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params

    const { data: invite, error } = await supabaseAdmin
      .from('tenant_invites')
      .select(`
        *,
        properties (
          id,
          address,
          lease_start,
          lease_end
        )
      `)
      .eq('token', token)
      .single()

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 })
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      // Update status to expired
      await supabaseAdmin
        .from('tenant_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id)

      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 })
    }

    // Check if already accepted
    if (invite.status === 'accepted') {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 })
    }

    if (invite.status === 'expired') {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 })
    }

    return NextResponse.json(invite)
  } catch (error) {
    console.error('Error validating invite:', error)
    return NextResponse.json({ error: 'Failed to validate invite' }, { status: 500 })
  }
}

// POST - Accept invite and create user account
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    const body = await request.json()
    const { password } = body

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Fetch the invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('tenant_invites')
      .select('*')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 })
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 })
    }

    // Check if already accepted
    if (invite.status === 'accepted') {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 })
    }

    // Use role from invite (tenant or owner)
    const userRole = invite.role || 'tenant'

    // Create the user account
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        role: userRole,
      },
    })

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('already registered')) {
        // User exists, just create the association
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
        const user = existingUser.users.find(u => u.email === invite.email)

        if (user) {
          // Create user-property association with the role from invite
          const userPropertyData: any = {
            user_id: user.id,
            property_id: invite.property_id,
            role: userRole,
          }

          // Add ownership percentage for owners
          if (userRole === 'owner' && invite.ownership_percentage) {
            userPropertyData.ownership_percentage = invite.ownership_percentage
          }

          await supabaseAdmin
            .from('user_properties')
            .insert(userPropertyData)

          // Mark invite as accepted
          await supabaseAdmin
            .from('tenant_invites')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
            })
            .eq('id', invite.id)

          return NextResponse.json({
            success: true,
            message: 'Property access granted to existing account',
            userId: user.id
          })
        }
      }

      throw authError
    }

    // Create user-property association with the role from invite
    const userPropertyData: any = {
      user_id: authData.user.id,
      property_id: invite.property_id,
      role: userRole,
    }

    // Add ownership percentage for owners
    if (userRole === 'owner' && invite.ownership_percentage) {
      userPropertyData.ownership_percentage = invite.ownership_percentage
    }

    await supabaseAdmin
      .from('user_properties')
      .insert(userPropertyData)

    // Mark invite as accepted
    await supabaseAdmin
      .from('tenant_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id)

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      userId: authData.user.id
    })
  } catch (error: any) {
    console.error('Error accepting invite:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to accept invite' },
      { status: 500 }
    )
  }
}
