/**
 * /onboarding — getting-started checklist (substrate-lego-wiring-001 Phase 3).
 * Mounts @nexus/onboarding. The lego has no step-catalog initializer, so the
 * substrate seeds the user's steps from the lego config defaults on first
 * visit (each as "pending"), then renders the OnboardingChecklist.
 */
import type { JSX } from "react";
import Link from "next/link";
import { OnboardingChecklist } from "@nexus/onboarding/ui/OnboardingChecklist";
import { handleGetProgress, handleUpdateStep } from "@nexus/onboarding";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { getLegoConfig } from "@/lib/lego-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_STEPS = ["verify_email", "complete_profile", "first_action", "invite_team"];

export default async function OnboardingPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to see your getting-started checklist.
        </p>
      </main>
    );
  }

  const ctx = { db: buildDb(), events: buildEventBus() };
  const progress = await handleGetProgress(ctx, user.id);
  const total =
    progress.status === 200 && typeof progress.body === "object"
      ? Number((progress.body as { total?: number }).total ?? 0)
      : 0;

  // Seed steps on first visit (the lego has no initializer).
  if (total === 0) {
    const cfg = getLegoConfig("onboarding");
    const steps = (cfg.steps as string[] | undefined)?.length ? (cfg.steps as string[]) : DEFAULT_STEPS;
    for (const step_key of steps) {
      await handleUpdateStep(ctx, { user_id: user.id, step_key, status: "pending" });
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Getting started</h1>
        <p className="text-sm text-gray-500">A few steps to get the most out of your account.</p>
      </header>
      <OnboardingChecklist userId={user.id} />
    </main>
  );
}
