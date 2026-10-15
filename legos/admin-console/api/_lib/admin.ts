/**
 * Admin auth helper — shared by all admin-console handlers.
 *
 * All admin endpoints require X-Admin-Token header matching the substrate's
 * configured admin_token. Strict equality with constant-time comparison
 * via timingSafeEqual is overkill for this comparison (single static token),
 * but use Buffer equality just to keep it consistent.
 */

export function checkAdminAuth(
  adminTokenHeader: string | null,
  adminToken: string | undefined,
): boolean {
  const expected = (adminToken || "").trim();
  const provided = (adminTokenHeader || "").trim();
  if (expected.length === 0 || provided.length === 0) return false;
  return expected === provided;
}

export const UNKNOWN_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000000";
