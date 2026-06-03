import { supabaseAdmin } from "@/lib/supabase/server";
import { CANONICAL_PORTAL_URL } from "@/lib/email/payments-due-soon";
import { buildInviteUrl } from "@/lib/invite-url";

export type BillingRecipientSource = "auth_user" | "pending_invite" | "manual";
export type BillingRecipientRole = "tenant" | "owner";
export type BillingEmailBillType = "tenant_bill" | "owner_invoice";
export type BillingEmailAuditStatus = "sent" | "skipped" | "failed";

export type BillingRecipientFields = {
  recipient_email?: string | null;
  recipient_name?: string | null;
  recipient_source?: string | null;
  recipient_invite_id?: string | null;
  recipient_user_id?: string | null;
};

export type ResolvedBillingRecipient =
  | {
      ok: true;
      email: string;
      name: string | null;
      source: BillingRecipientSource;
      ctaUrl: string;
      inviteId?: string | null;
      userId?: string | null;
    }
  | {
      ok: false;
      source: BillingRecipientSource | null;
      email?: string | null;
      skipReason: string;
    };

type InviteRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  property_id: string | null;
  token: string | null;
  status: string | null;
  expires_at: string | null;
};

const VALID_SOURCES = new Set(["auth_user", "pending_invite", "manual"]);

export const normalizeBillingRecipientSource = (value?: string | null): BillingRecipientSource | null => {
  const normalized = String(value || "").trim();
  return VALID_SOURCES.has(normalized) ? (normalized as BillingRecipientSource) : null;
};

export const buildBillingPortalCtaUrl = (role: BillingRecipientRole) =>
  `${CANONICAL_PORTAL_URL}${role === "owner" ? "/owner/billing" : "/tenant/payments"}`;

const buildInviteCtaUrl = (token: string, role: BillingRecipientRole) => {
  const nextPath = role === "owner" ? "/owner/billing" : "/tenant/payments";
  return `${buildInviteUrl(token)}?next=${encodeURIComponent(nextPath)}`;
};

const isInviteValidForRecipient = (invite: InviteRow, role: BillingRecipientRole, propertyId: string) => {
  if (invite.role !== role) return false;
  if (invite.property_id !== propertyId) return false;
  if (invite.status !== "pending") return false;
  if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) return false;
  return !!invite.email && !!invite.token;
};

const getAuthUserInfo = async (userId: string | null | undefined) => {
  if (!userId) return null;
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  const metadataName = String(data.user.user_metadata?.name || "").trim();
  return {
    userId,
    email: data.user.email,
    name: metadataName || data.user.email.split("@")[0] || null,
  };
};

const getFirstAuthRecipient = async (userIds: Array<string | null | undefined>) => {
  const uniqueIds = Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)));
  for (const userId of uniqueIds) {
    const info = await getAuthUserInfo(userId);
    if (info?.email) return info;
  }
  return null;
};

const getInviteById = async (inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("tenant_invites")
    .select("id, email, name, role, property_id, token, status, expires_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) throw error;
  return data as InviteRow | null;
};

const getPendingInviteForPropertyRole = async (propertyId: string, role: BillingRecipientRole) => {
  const { data, error } = await supabaseAdmin
    .from("tenant_invites")
    .select("id, email, name, role, property_id, token, status, expires_at")
    .eq("property_id", propertyId)
    .eq("role", role)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const invites = (data || []) as InviteRow[];
  const valid = invites.find((invite) => isInviteValidForRecipient(invite, role, propertyId));
  if (valid) return { invite: valid, skipReason: null as string | null };

  const hasExpired = invites.some(
    (invite) =>
      invite.status === "expired" ||
      (invite.status === "pending" && invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now())
  );
  return { invite: null, skipReason: hasExpired ? "pending_invite_expired" : "missing_recipient" };
};

export const resolveBillingRecipient = async (params: {
  role: BillingRecipientRole;
  propertyId: string;
  fields?: BillingRecipientFields | null;
  linkedUserIds?: Array<string | null | undefined>;
}): Promise<ResolvedBillingRecipient> => {
  const role = params.role;
  const propertyId = String(params.propertyId || "").trim();
  const fields = params.fields || {};
  const explicitEmail = String(fields.recipient_email || "").trim();
  const source = normalizeBillingRecipientSource(fields.recipient_source);

  if (explicitEmail) {
    if (source === "pending_invite") {
      const inviteId = String(fields.recipient_invite_id || "").trim();
      if (!inviteId) {
        return { ok: false, source, email: explicitEmail, skipReason: "pending_invite_missing_id" };
      }
      const invite = await getInviteById(inviteId);
      if (!invite) {
        return { ok: false, source, email: explicitEmail, skipReason: "pending_invite_not_found" };
      }
      if (!isInviteValidForRecipient(invite, role, propertyId)) {
        return { ok: false, source, email: explicitEmail, skipReason: "pending_invite_expired" };
      }
      return {
        ok: true,
        email: invite.email || explicitEmail,
        name: fields.recipient_name || invite.name || null,
        source,
        ctaUrl: buildInviteCtaUrl(invite.token || "", role),
        inviteId: invite.id,
      };
    }

    const resolvedSource = source || "manual";
    return {
      ok: true,
      email: explicitEmail,
      name: fields.recipient_name || null,
      source: resolvedSource,
      ctaUrl: buildBillingPortalCtaUrl(role),
      userId: fields.recipient_user_id || null,
      inviteId: fields.recipient_invite_id || null,
    };
  }

  const explicitUserId = String(fields.recipient_user_id || "").trim();
  const authRecipient = await getFirstAuthRecipient([
    explicitUserId || null,
    ...(params.linkedUserIds || []),
  ]);
  if (authRecipient) {
    return {
      ok: true,
      email: authRecipient.email,
      name: fields.recipient_name || authRecipient.name,
      source: "auth_user",
      ctaUrl: buildBillingPortalCtaUrl(role),
      userId: authRecipient.userId,
    };
  }

  if (!propertyId) {
    return { ok: false, source: null, skipReason: "missing_property" };
  }

  const { invite, skipReason } = await getPendingInviteForPropertyRole(propertyId, role);
  if (invite) {
    return {
      ok: true,
      email: invite.email || "",
      name: invite.name || null,
      source: "pending_invite",
      ctaUrl: buildInviteCtaUrl(invite.token || "", role),
      inviteId: invite.id,
    };
  }

  return { ok: false, source: null, skipReason: skipReason || "missing_recipient" };
};

export const logBillingEmailAudit = async (payload: {
  billType: BillingEmailBillType;
  billId: string;
  emailType: string;
  recipientEmail?: string | null;
  recipientSource?: BillingRecipientSource | null;
  status: BillingEmailAuditStatus;
  skipReason?: string | null;
  errorMessage?: string | null;
}) => {
  await supabaseAdmin.from("billing_email_audit_logs").insert({
    bill_type: payload.billType,
    bill_id: payload.billId,
    email_type: payload.emailType,
    recipient_email: payload.recipientEmail || null,
    recipient_source: payload.recipientSource || null,
    status: payload.status,
    skip_reason: payload.skipReason || null,
    error_message: payload.errorMessage || null,
  });
};
