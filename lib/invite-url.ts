export const CANONICAL_PORTAL_URL = "https://portal.luxordev.com";

export function buildInviteUrl(token: string) {
  return `${CANONICAL_PORTAL_URL}/invite/${token}`;
}
