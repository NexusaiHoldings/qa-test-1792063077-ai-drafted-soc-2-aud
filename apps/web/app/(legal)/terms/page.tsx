import type { JSX } from "react";
import { renderLegalDoc } from "@/lib/legal-doc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TermsPage(): Promise<JSX.Element> {
  return renderLegalDoc("terms_of_service", "Terms of Service");
}
