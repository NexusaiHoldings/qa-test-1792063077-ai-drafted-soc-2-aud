/**
 * Root route (company-root-landing-001). The product picks its front door via
 * apps/web/lib/home/home-config.ts:
 *   mode "conversation" → §6.1 ConversationSurface (chat-first products).
 *   mode "landing"      → themed hero (<Landing>); the conversation surface
 *                         stays reachable at /assistant.
 * Default config ships as a generic landing; provisioning overwrites per company.
 */
import type { JSX } from "react";
import { homeConfig } from "@/lib/home/home-config";
import { ConversationSurface } from "@/components/conversation/surface";
import { Landing } from "@/components/Landing";

export default function HomePage(): JSX.Element {
  if (homeConfig.mode === "conversation") {
    const companyName = process.env.COMPANY_NAME || "Portfolio Company";
    return <ConversationSurface companyName={companyName} />;
  }
  return <Landing />;
}
