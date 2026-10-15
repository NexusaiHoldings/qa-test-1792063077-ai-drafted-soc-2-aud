/**
 * /assistant — the §6.1 conversation surface at a stable route
 * (company-root-landing-001). Always available regardless of home-config.mode,
 * so landing-mode products (and the portfolio-runtime) never lose the surface.
 */
import type { JSX } from "react";
import { ConversationSurface } from "@/components/conversation/surface";

export default function AssistantPage(): JSX.Element {
  const companyName = process.env.COMPANY_NAME || "Portfolio Company";
  return <ConversationSurface companyName={companyName} />;
}
