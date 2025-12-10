import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { supabaseAdmin } from '@/lib/supabase/server'

// GET - Fetch properties associated with the authenticated user
export async function GET(request: Request) {
  try {
    // Get user ID from query params (for server-side calls) or from auth
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

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
    const properties = data.map(item => ({
      id: item.properties.id,
      address: item.properties.address,
      leaseStart: item.properties.lease_start,
      leaseEnd: item.properties.lease_end,
      role: item.role,
      associatedAt: item.created_at,
    }))

    return NextResponse.json(properties)
  } catch (error) {
    console.error('Error fetching user properties:', error)
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}
