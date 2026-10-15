/**
 * Admin sections registry API.
 *
 * Ported 2026-05-12 from api/sections.py.
 *   GET    /api/admin/sections             — list (RBAC-filtered by user_roles)
 *   POST   /api/admin/sections/register    — register lego section at install
 *   DELETE /api/admin/sections/{lego_name} — unregister on lego uninstall
 *
 * All endpoints require X-Admin-Token.
 */

import { checkAdminAuth } from "./_lib/admin";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

export interface ListSectionsInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly userRoles?: string[];
  readonly ctx: HandlerContext;
}

interface SectionRow {
  id: string;
  lego_name: string;
  section_name: string;
  section_order: number;
  permissions: string[] | null;
  routes: unknown;
}

export async function handleListSections({
  adminTokenHeader,
  adminToken,
  userRoles,
  ctx,
}: ListSectionsInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  const roles = userRoles && userRoles.length > 0 ? userRoles : ["admin"];

  try {
    const rows = await ctx.db.query<SectionRow>(
      "SELECT id, lego_name, section_name, section_order, permissions, routes " +
        "FROM admin_sections ORDER BY section_order ASC",
    );
    const visible = rows
      .filter((r) =>
        roles.some((role) => (r.permissions || []).includes(role)),
      )
      .map((r) => ({
        id: r.id,
        lego_name: r.lego_name,
        section_name: r.section_name,
        section_order: r.section_order,
        routes: r.routes,
      }));
    await ctx.events.publish("admin.section_loaded", { count: visible.length });
    return ok({ sections: visible });
  } catch {
    return err(500, "internal error");
  }
}

export interface RegisterSectionInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly body: {
    lego_name?: string;
    section_name?: string;
    section_order?: number;
    permissions?: string[];
    routes?: unknown[];
  };
  readonly ctx: HandlerContext;
}

export async function handleRegisterSection({
  adminTokenHeader,
  adminToken,
  body,
  ctx,
}: RegisterSectionInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  const lego = body.lego_name || "";
  const sec = body.section_name || "";
  const order = body.section_order;
  const perms = body.permissions || [];
  const routes = body.routes || [];
  if (!lego || !sec || order === undefined || perms.length === 0 || routes.length === 0) {
    return err(
      400,
      "lego_name, section_name, section_order, permissions, routes required",
    );
  }
  try {
    await ctx.db.execute(
      "INSERT INTO admin_sections (lego_name, section_name, section_order, permissions, routes) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (lego_name, section_name) DO UPDATE SET " +
        "section_order=EXCLUDED.section_order, permissions=EXCLUDED.permissions, routes=EXCLUDED.routes",
      lego,
      sec,
      order,
      perms,
      routes,
    );
  } catch {
    return err(500, "internal error");
  }
  return ok({ status: "registered" });
}

export interface UnregisterSectionInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly legoName: string;
  readonly ctx: HandlerContext;
}

export async function handleUnregisterSection({
  adminTokenHeader,
  adminToken,
  legoName,
  ctx,
}: UnregisterSectionInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    await ctx.db.execute(
      "DELETE FROM admin_sections WHERE lego_name = $1",
      legoName,
    );
  } catch {
    return err(500, "internal error");
  }
  return ok({ status: "unregistered" });
}
