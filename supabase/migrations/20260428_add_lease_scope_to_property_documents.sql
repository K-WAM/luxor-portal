alter table if exists public.property_documents
  add column if not exists lease_agreement_id uuid null references public.lease_agreements(id) on delete set null;

alter table if exists public.property_documents
  add column if not exists document_type text null;

create index if not exists idx_property_documents_lease_agreement_id
  on public.property_documents(lease_agreement_id);

create index if not exists idx_property_documents_document_type
  on public.property_documents(document_type);

update public.property_documents
set document_type = coalesce(nullif(title, ''), 'Other')
where document_type is null;

update public.property_documents
set lease_agreement_id = null
where lease_agreement_id is not null;

update public.property_documents
set visibility = 'owner'
where lease_agreement_id is null
  and coalesce(document_type, title, '') in (
    'Lease Agreement',
    'Move-In Inspection',
    'Move-Out Inspection',
    'Tenant Insurance Confirmation',
    'Tenant Notices',
    'Tenant Correspondence'
  )
  and visibility in ('tenant', 'all');

-- rollback guidance:
-- alter table if exists public.property_documents drop column if exists lease_agreement_id;
-- alter table if exists public.property_documents drop column if exists document_type;
