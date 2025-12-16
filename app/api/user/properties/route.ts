import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, isAdmin } from '@/lib/auth/route-helpers'

// GET - Fetch properties associated with the authenticated user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId')
    const { user, role } = await getAuthContext()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userId = isAdmin(role) && requestedUserId ? requestedUserId : user.id

    const { data, error } = await supabaseAdmin
      .from('user_properties')
      .select(`
        id,
        role,
        created_at,
        properties (
          id,
          address,
          lease_start,
          lease_end,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Flatten the response for easier use
    const properties = (data || [])
      .filter(item => item.properties)
      .map(item => {
        const prop = item.properties as any
        return {
          id: prop.id,
          address: prop.address,
          leaseStart: prop.lease_start,
          leaseEnd: prop.lease_end,
          role: item.role,
          associatedAt: item.created_at,
        }
      })

    return NextResponse.json(properties)
  } catch (error) {
    console.error('Error fetching user properties:', error)
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}
