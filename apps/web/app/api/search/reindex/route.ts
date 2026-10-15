/**
 * POST /api/search/reindex — rebuild the search index (ADMIN).
 * Substrate indexer trigger for @nexus/search (substrate-lego-wiring-001).
 * Picks up newly-published KB content (the lazy first-search reindex only
 * fires when the index is entirely empty).
 */
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { reindexAll } from "@/lib/search-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const counts = await reindexAll();
  return NextResponse.json({ reindexed: counts }, { status: 200 });
}
