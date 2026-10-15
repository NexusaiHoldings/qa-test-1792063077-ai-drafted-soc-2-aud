/**
 * Organization + membership handlers — organizations-and-teams lego.
 * Framework-agnostic.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

const VALID_ROLE = new Set(["owner", "admin", "member", "viewer"]);

function _slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** POST /api/orgs — create an org (creator becomes owner). */
export async function handleCreateOrg(
  ctx: HandlerContext,
  body: { name?: string; owner_user_id?: string; seat_limit?: number },
): Promise<HandlerResult> {
  const name = (body.name ?? "").trim();
  const owner = body.owner_user_id ?? "";
  if (!name) return err(400, "name is required");
  if (!owner) return err(400, "owner_user_id is required");
  const slug = `${_slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO organizations (name, slug, owner_user_id, seat_limit)
     VALUES ($1, $2, $3, $4) RETURNING id, slug`,
    name, slug, owner, body.seat_limit ?? 5,
  );
  const orgId = rows[0].id as string;
  await ctx.db.execute(
    `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
    orgId, owner,
  );
  return ok({ org_id: orgId, slug: rows[0].slug }, 201);
}

/** GET /api/orgs/{id}/members — list members. */
export async function handleListMembers(
  ctx: HandlerContext,
  orgId: string,
): Promise<HandlerResult> {
  if (!orgId) return err(400, "org id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, user_id, role, joined_at, last_active_at
     FROM org_members WHERE org_id = $1 ORDER BY joined_at ASC`,
    orgId,
  );
  return ok({ members: rows, count: rows.length });
}

/** POST /api/orgs/{id}/invitations — invite a member (seat-aware). */
export async function handleInviteMember(
  ctx: HandlerContext,
  orgId: string,
  body: { email?: string; role?: string; invited_by?: string; expiry_days?: number; enforce_seats?: boolean },
): Promise<HandlerResult> {
  if (!orgId) return err(400, "org id is required");
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return err(400, "email is required");
  const role = VALID_ROLE.has(body.role ?? "") ? body.role! : "member";

  const orgs = await ctx.db.query<DbRow>(`SELECT seat_limit FROM organizations WHERE id = $1`, orgId);
  if (orgs.length === 0) return err(404, "org not found");
  if (body.enforce_seats !== false) {
    const seatLimit = Number(orgs[0].seat_limit) || 0;
    if (seatLimit > 0) {
      const counts = await ctx.db.query<DbRow>(
        `SELECT (SELECT COUNT(*) FROM org_members WHERE org_id = $1)
              + (SELECT COUNT(*) FROM org_invitations WHERE org_id = $1 AND status = 'pending') AS used`,
        orgId,
      );
      if (Number(counts[0].used) >= seatLimit) {
        return err(409, "seat limit reached");
      }
    }
  }

  const token = `inv_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const expiryDays = Math.max(1, body.expiry_days ?? 14);
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO org_invitations (org_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
     RETURNING id, token`,
    orgId, email, role, token, body.invited_by ?? null, String(expiryDays),
  );
  await ctx.db.execute(
    `INSERT INTO org_audit_log (org_id, actor_id, action, detail)
     VALUES ($1, $2, 'member_invited', $3::jsonb)`,
    orgId, body.invited_by ?? null, JSON.stringify({ email, role }),
  );
  await ctx.events.publish("org.member_invited", { org_id: orgId, email, role });
  return ok({ invitation_id: rows[0].id, token: rows[0].token }, 201);
}

/** POST /api/orgs/invitations/accept — accept an invitation (adds member). */
export async function handleAcceptInvitation(
  ctx: HandlerContext,
  body: { token?: string; user_id?: string },
): Promise<HandlerResult> {
  const token = (body.token ?? "").trim();
  const userId = body.user_id ?? "";
  if (!token || !userId) return err(400, "token and user_id are required");
  const invs = await ctx.db.query<DbRow>(
    `SELECT id, org_id, role FROM org_invitations
     WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
    token,
  );
  if (invs.length === 0) return err(404, "invitation not found, expired, or already used");
  const inv = invs[0];
  await ctx.db.execute(
    `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    inv.org_id, userId, inv.role,
  );
  await ctx.db.execute(`UPDATE org_invitations SET status = 'accepted' WHERE id = $1`, inv.id);
  await ctx.events.publish("org.member_joined", { org_id: inv.org_id, user_id: userId, role: inv.role });
  return ok({ org_id: inv.org_id, role: inv.role });
}

/**
 * POST /api/orgs/{id}/members/{user_id}/role — change a member's role.
 * Server-side mutation behind the change_member_role agent tool (the tool
 * routes through approval; on confirm the runtime/app calls this).
 * Guards against demoting the last owner.
 */
export async function handleChangeRole(
  ctx: HandlerContext,
  orgId: string,
  userId: string,
  body: { new_role?: string; reason?: string; actor_id?: string },
): Promise<HandlerResult> {
  if (!orgId || !userId) return err(400, "org id and user id are required");
  const newRole = body.new_role ?? "";
  if (!VALID_ROLE.has(newRole)) return err(400, "invalid new_role");

  const current = await ctx.db.query<DbRow>(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
    orgId, userId,
  );
  if (current.length === 0) return err(404, "member not found");
  if (current[0].role === "owner" && newRole !== "owner") {
    const owners = await ctx.db.query<DbRow>(
      `SELECT COUNT(*) AS n FROM org_members WHERE org_id = $1 AND role = 'owner'`,
      orgId,
    );
    if (Number(owners[0].n) <= 1) return err(409, "cannot demote the last owner");
  }

  await ctx.db.execute(
    `UPDATE org_members SET role = $3 WHERE org_id = $1 AND user_id = $2`,
    orgId, userId, newRole,
  );
  await ctx.db.execute(
    `INSERT INTO org_audit_log (org_id, actor_id, actor_type, action, detail)
     VALUES ($1, $2, 'agent', 'member_role_changed', $3::jsonb)`,
    orgId, body.actor_id ?? null,
    JSON.stringify({ user_id: userId, new_role: newRole, reason: body.reason ?? null }),
  );
  await ctx.events.publish("org.member_role_changed", { org_id: orgId, user_id: userId, role: newRole });
  return ok({ org_id: orgId, user_id: userId, role: newRole });
}
