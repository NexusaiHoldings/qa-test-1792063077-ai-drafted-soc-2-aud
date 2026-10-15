/**
 * GET /api/search?q=&type= — search (PUBLIC). Substrate shim for @nexus/search.
 * Lazily reindexes the KB into search_index on the first search when the index
 * is empty, so a freshly-deployed company's command palette returns results
 * out of the box. Reindex failures are swallowed — search still runs.
 */
import { NextResponse } from "next/server";
import { handleSearch } from "@nexus/search";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";
import { searchIndexIsEmpty, reindexKbArticles } from "@/lib/search-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const entity_type = url.searchParams.get("type") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;

  if (q.trim()) {
    try {
      if (await searchIndexIsEmpty()) await reindexKbArticles();
    } catch {
      /* best-effort — search proceeds against whatever is indexed */
    }
  }

  const result = await handleSearch(
    { db: buildDb(), events: buildEventBus() },
    { q, entity_type, limit },
  );
  return respond(result);
}
