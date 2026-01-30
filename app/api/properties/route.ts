import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers'
import { toDateOnlyString } from '@/lib/date-only'

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Admin can see all properties
    if (isAdmin(role)) {
      const { data, error } = await supabaseAdmin
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Owners/Tenants: only properties they are linked to
    const propertyIds = await getAccessiblePropertyIds(user.id, role);

    if (!propertyIds.length) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabaseAdmin
      .from('properties')
      .select('*')
      .in('id', propertyIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching properties:', error);
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json()
    
    const leaseStart = toDateOnlyString(body.leaseStart)
    const leaseEnd = toDateOnlyString(body.leaseEnd)

    const { data, error } = await supabaseAdmin
      .from('properties')
      .insert({
        address: body.address,
        owner_name: body.ownerName,
        lease_start: leaseStart,
        lease_end: leaseEnd,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating property:', error)
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Property ID required" }, { status: 400 });
    }

    const body = await request.json();
    const updates: any = {};
    if (body.address !== undefined) updates.address = body.address;
    if (body.ownerName !== undefined) updates.owner_name = body.ownerName;
    if (body.leaseStart !== undefined) updates.lease_start = toDateOnlyString(body.leaseStart);
    if (body.leaseEnd !== undefined) updates.lease_end = toDateOnlyString(body.leaseEnd);

    const { data, error } = await supabaseAdmin
      .from("properties")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating property:", error);
    return NextResponse.json({ error: "Failed to update property" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('properties')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting property:', error)
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 })
  }
}
