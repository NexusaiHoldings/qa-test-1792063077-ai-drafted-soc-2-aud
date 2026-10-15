/**
 * /help/[slug] — a single KB article (substrate-lego-wiring-001 Phase 2).
 * Server-renders the article body from @nexus/support-and-help.
 */
import type { JSX } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { handleGetArticle } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Article {
  title: string;
  body: string;
  category?: string | null;
  updated_at?: string;
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string };
}): Promise<JSX.Element> {
  let article: Article | null = null;
  const result = await handleGetArticle(
    { db: buildDb(), events: buildEventBus() },
    params.slug,
  );
  if (result.status === 200 && typeof result.body === "object") {
    article = (result.body as { article?: Article }).article ?? null;
  }
  if (!article) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link href="/help" className="text-sm text-blue-600 underline">
        ← Help Center
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">{article.title}</h1>
      <article className="whitespace-pre-wrap leading-relaxed text-gray-800">{article.body}</article>
    </main>
  );
}
