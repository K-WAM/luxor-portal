import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')

    let query = supabaseAdmin
      .from('property_documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (propertyId) {
      query = query.eq('property_id', propertyId)
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
    const formData = await request.formData()
    const file = formData.get('file') as File
    const propertyId = formData.get('propertyId') as string
    const title = formData.get('title') as string
    const category = formData.get('category') as string

    if (!file || !propertyId || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `${propertyId}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('property-documents')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('property-documents')
      .getPublicUrl(filePath)

    // Save metadata to database
    const { data, error } = await supabaseAdmin
      .from('property_documents')
      .insert({
        property_id: propertyId,
        title,
        category,
        name: file.name,
        file_url: publicUrl,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error uploading document:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}