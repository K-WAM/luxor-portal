export const TENANT_SENSITIVE_DOCUMENT_TYPES = [
  "Lease Agreement",
  "Move-In Inspection",
  "Move-Out Inspection",
  "Tenant Insurance Confirmation",
  "Tenant Notices",
  "Tenant Correspondence",
] as const;

export const PROPERTY_WIDE_DOCUMENT_TYPES = [
  "HOA Rules",
  "Home Manuals",
  "Appliance Manuals",
  "General Property Notices",
  "Reports",
  "Welcome Package",
  "Other",
] as const;

export const DOCUMENT_TYPES = [
  ...TENANT_SENSITIVE_DOCUMENT_TYPES,
  ...PROPERTY_WIDE_DOCUMENT_TYPES,
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const isTenantSensitiveDocumentType = (value?: string | null) =>
  TENANT_SENSITIVE_DOCUMENT_TYPES.includes(
    String(value || "") as (typeof TENANT_SENSITIVE_DOCUMENT_TYPES)[number]
  );

export const getDocumentScopeLabel = (leaseAgreementId?: string | null) =>
  leaseAgreementId ? "Lease-specific" : "Property-wide";
