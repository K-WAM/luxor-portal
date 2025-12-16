import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')

    const { user, role } = await getAuthContext()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let query = supabaseAdmin
      .from('property_documents')
      .select('*')
      .order('created_at', { ascending: false })

    // Admin sees everything (optional property filter)
    if (isAdmin(role)) {
      if (propertyId) query = query.eq('property_id', propertyId)
      const { data, error } = await query
      if (error) throw error
      return NextResponse.json(data || [])
    }

    // Owners/Tenants: enforce property scope and visibility
    const allowedProperties = await getAccessiblePropertyIds(user.id, role)
    if (!allowedProperties.length) {
      return NextResponse.json([], { status: 200 })
    }

    if (propertyId && !allowedProperties.includes(propertyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    query = query.in('property_id', propertyId ? [propertyId] : allowedProperties)

    if (role === 'tenant') {
      query = query.in('visibility', ['tenant', 'all'])
    } else if (role === 'owner') {
      query = query.in('visibility', ['owner', 'all'])
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const property_id = formData.get('property_id') as string
    const title = (formData.get('title') as string) || file?.name || 'Untitled'
    const visibility = (formData.get('visibility') as string) || 'owner'

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const storage_path = `${property_id}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('property-documents')
      .upload(storage_path, file)

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('property-documents')
      .getPublicUrl(storage_path)

    // Save metadata to database
    const { data, error } = await supabaseAdmin
      .from('property_documents')
      .insert({
        property_id,
        title,
        file_url: publicUrl,
        visibility,
        name: file.name,
      })
      .select()
      .single()

    if (error) {
      console.error('Database insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error uploading document:', error)
    return NextResponse.json({ error: error.message || 'Failed to upload document' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // First, get the document to find the file_url
    const { data: document, error: fetchError } = await supabaseAdmin
      .from('property_documents')
      .select('file_url, property_id')
      .eq('id', documentId)
      .single()

    if (fetchError) {
      console.error('Error fetching document:', fetchError)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Extract storage path from file_url
    // file_url format: https://[project].supabase.co/storage/v1/object/public/property-documents/[property_id]/[filename]
    const urlParts = document.file_url.split('/property-documents/')
    const storage_path = urlParts[1] // This gives us: property_id/filename

    // Delete from storage
    if (storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('property-documents')
        .remove([storage_path])

      if (storageError) {
        console.error('Storage deletion error:', storageError)
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from('property_documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      console.error('Database delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Document deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete document' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext()
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const { id, visibility } = body as { id?: string; visibility?: string }

    const allowed = ['admin', 'owner', 'tenant', 'all']

    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    if (!visibility || !allowed.includes(visibility)) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('property_documents')
      .update({ visibility })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Database update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error updating document visibility:', error)
    return NextResponse.json({ error: error.message || 'Failed to update document' }, { status: 500 })
  }
}
