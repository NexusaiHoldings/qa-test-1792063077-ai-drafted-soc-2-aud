import type { JSX } from "react";
import { renderLegalDoc } from "@/lib/legal-doc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PrivacyPage(): Promise<JSX.Element> {
  return renderLegalDoc("privacy_policy", "Privacy Policy");
}
