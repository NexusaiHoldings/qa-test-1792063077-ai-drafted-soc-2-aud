/**
 * /help — knowledge base index (substrate-lego-wiring-001 Phase 2).
 * Server-renders published articles from @nexus/support-and-help. Degrades to
 * a friendly empty state; the floating SupportWidget handles new tickets.
 */
import type { JSX } from "react";
import Link from "next/link";
import { handleListArticles } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ArticleSummary {
  slug: string;
  title: string;
  category?: string | null;
}

export default async function HelpPage(): Promise<JSX.Element> {
  let articles: ArticleSummary[] = [];
  try {
    const result = await handleListArticles(
      { db: buildDb(), events: buildEventBus() },
      { limit: 100 },
    );
    if (result.status === 200 && typeof result.body === "object") {
      articles = ((result.body as { articles?: ArticleSummary[] }).articles) ?? [];
    }
  } catch {
    articles = [];
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Help Center</h1>
      {articles.length > 0 ? (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/help/${encodeURIComponent(a.slug)}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">{a.title}</span>
                {a.category && <span className="text-xs uppercase tracking-wide text-gray-400">{a.category}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">
          Our knowledge base is being built out. Use the support button in the corner to ask a
          question or open a ticket — we&apos;re here to help.
        </p>
      )}
      <p className="text-sm text-gray-500">
        Need to talk to someone? <Link href="/support" className="text-blue-600 underline">View your support tickets</Link>.
      </p>
    </main>
  );
}
