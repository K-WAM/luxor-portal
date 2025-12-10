# Tenant Invite System Setup Guide

This guide will help you set up the tenant invite system for your Luxor Portal application.

## Overview

The tenant invite system allows you as an admin to:
- Invite tenants via email
- Automatically associate tenants with specific properties
- Control which properties tenants can access
- Ensure tenants can only submit maintenance requests for their assigned properties

## Step 1: Run the Database Migration

You need to create the required database tables in your Supabase database.

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `supabase/migrations/20241209_tenant_invites_and_associations.sql`
5. Paste into the SQL editor and click **Run**

### Option B: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
cd luxor-portal
supabase db push
```

## Step 2: Verify Tables Were Created

In your Supabase dashboard, navigate to **Table Editor** and verify these new tables exist:

- `tenant_invites` - Stores invite information
- `user_properties` - Associates users with properties

## Step 3: Test the Invite Flow

### As Admin:

1. Sign in to the admin portal at http://localhost:3000
2. Navigate to **Tenant Invites** in the sidebar
3. Click **Create New Invite**
4. Enter:
   - Tenant's email address
   - Select a property from the dropdown
5. Click **Create Invite**
6. Copy the generated invite link
7. Share the link with your tenant (via email, text, etc.)

### As Tenant:

1. Click on the invite link (e.g., `http://localhost:3000/invite/abc123...`)
2. Review the property details
3. Create a password (min 6 characters)
4. Click **Create Account**
5. You'll be redirected to the sign-in page
6. Sign in with the email from the invite and your new password
7. Navigate to **Maintenance** in the tenant portal
8. You'll see a dropdown with only YOUR assigned property
9. Submit a maintenance request

### As Admin (Review Request):

1. Go to **Maintenance Requests** in the admin panel
2. View the request in the Active Requests table
3. Update the status as needed (Open → In Progress → Closed)
4. When closed, add admin notes/cost information

## How It Works

### 1. Invite Creation
- Admin selects a property and enters tenant email
- System generates a secure random token
- Invite expires in 7 days
- Invite link: `/invite/{token}`

### 2. Account Creation
- Tenant clicks invite link
- System validates token (checks if expired/used)
- Tenant creates password
- System creates user account with role='tenant'
- System creates user-property association
- Invite marked as 'accepted'

### 3. Property Filtering
- When tenant signs in, they only see their associated properties
- Maintenance requests can only be submitted for assigned properties
- Past requests filtered to show only their properties
- No access to other properties in the system

## Security Features

- ✅ Invite tokens are cryptographically secure (32-byte random)
- ✅ Invites expire after 7 days
- ✅ Invites can only be used once
- ✅ Row Level Security (RLS) policies enforce access control
- ✅ Tenants can only see their own property associations
- ✅ Admin-only access to invite management

## API Endpoints

### Admin Endpoints:
- `GET /api/invites` - List all invites
- `POST /api/invites` - Create new invite
- `DELETE /api/invites?id={id}` - Delete invite

### Public Endpoints:
- `GET /api/invites/{token}` - Validate invite
- `POST /api/invites/{token}` - Accept invite (create account)

### User Endpoints:
- `GET /api/user/properties?userId={id}` - Get user's properties

## Troubleshooting

### Invite link doesn't work
- Check if invite has expired (7 days from creation)
- Check if invite was already used (status='accepted')
- Verify the token in the URL matches database

### Tenant can't see properties
- Verify user_properties association exists in database
- Check that property_id matches an existing property
- Ensure user is signed in with correct email

### Maintenance request fails
- Ensure property_id is a valid UUID
- Check that property exists in properties table
- Verify user-property association exists

## Database Schema

### tenant_invites
```sql
- id (uuid, primary key)
- property_id (uuid, foreign key → properties)
- email (text)
- token (text, unique)
- expires_at (timestamptz)
- status (text: 'pending' | 'accepted' | 'expired')
- created_at (timestamptz)
- accepted_at (timestamptz)
```

### user_properties
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key → auth.users)
- property_id (uuid, foreign key → properties)
- role (text: 'tenant' | 'owner')
- created_at (timestamptz)
```

## Next Steps

After testing the system:

1. **Email Integration**: Add email sending functionality to automatically send invite links
2. **Invite Expiration**: Add a background job to auto-expire old invites
3. **Bulk Invites**: Allow importing multiple tenants from CSV
4. **Tenant Management**: Add UI to view all tenants and their property associations
5. **Invite Templates**: Create email templates for professional invite messages

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check the Next.js server logs
3. Verify database tables were created correctly
4. Ensure environment variables are set (`.env.local`)
