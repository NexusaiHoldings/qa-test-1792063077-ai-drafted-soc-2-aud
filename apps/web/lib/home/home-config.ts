/**
 * home-config — the company's root surface (company-root-landing-001 +
 * homepage-composition-001). Written by provisioning (_step_substrate_install)
 * from the homepage composer / CTO home_mode + CMO positioning. Do NOT hand-edit.
 */
export interface HomeCta {
  label: string;
  href: string;
}

export interface HomeFeature {
  title: string;
  body: string;
}

export interface SectionImage {
  url?: string;
  alt?: string;
  caption?: string;
}

export interface HeroSection {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  image?: SectionImage;
}
export interface StatsSection {
  type: "stats";
  title?: string;
  stats: { value: string; label: string }[];
}
export interface HowItWorksSection {
  type: "how_it_works";
  title?: string;
  subhead?: string;
  steps: { title: string; body: string }[];
}
export interface FeatureGridSection {
  type: "feature_grid";
  title?: string;
  subhead?: string;
  features: HomeFeature[];
}
export interface FeatureSpotlightSection {
  type: "feature_spotlight";
  title?: string;
  items: { title: string; body: string; image?: SectionImage }[];
}
export interface SocialProofSection {
  type: "social_proof";
  title?: string;
  quotes: { quote: string; author?: string; role?: string }[];
}
export interface FaqSection {
  type: "faq";
  title?: string;
  items: { q: string; a: string }[];
}
export interface PricingTeaserSection {
  type: "pricing_teaser";
  title?: string;
  subhead?: string;
  tiers: {
    name: string;
    price?: string;
    period?: string;
    features: string[];
    cta?: HomeCta;
    highlighted?: boolean;
  }[];
}
export interface GallerySection {
  type: "gallery";
  title?: string;
  images: SectionImage[];
}
export interface CtaBandSection {
  type: "cta_band";
  headline: string;
  subhead?: string;
  cta?: HomeCta;
}

export type HomeSection =
  | HeroSection
  | StatsSection
  | HowItWorksSection
  | FeatureGridSection
  | FeatureSpotlightSection
  | SocialProofSection
  | FaqSection
  | PricingTeaserSection
  | GallerySection
  | CtaBandSection;

export interface HomeConfig {
  mode: "landing" | "conversation";
  sections?: HomeSection[];
  headline?: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  featuresTitle?: string;
  features?: HomeFeature[];
  closingHeadline?: string;
}

export const homeConfig: HomeConfig = {
  "mode": "landing",
  "headline": "Audit-ready in weeks, not months. Connect AWS and GitHub read-only, get your SOC 2 gap report in 24 hours, and turn the\u2026",
  "subhead": "Nexus replaces the $30K\u2013$80K, 12-week SOC 2 consultant engagement with an AI agent that reads a Series A SaaS company's AWS/GCP configuration, GitHub, and HRIS and hands back the 10 auditor-requested policy documents plus a dated gap\u2026",
  "sections": [
    {
      "type": "hero",
      "headline": "SOC 2 ready in weeks, not a $50K consultant engagement",
      "eyebrow": "SOC 2 Audit Prep \u2014 $1,999/mo flat",
      "subhead": "Connect AWS and GitHub read-only in minutes. Get a dated gap report in 24 hours, every policy doc drafted from your actual config, and a weekly remediation queue until your audit.",
      "primaryCta": {
        "label": "Run your free gap scan",
        "href": "/signup"
      },
      "secondaryCta": {
        "label": "See a sample report",
        "href": "/sample-report"
      },
      "image": {
        "url": "hero_image"
      }
    },
    {
      "type": "stats",
      "stats": [
        {
          "value": "$1,999/mo",
          "label": "Flat fee \u2014 no add-ons, no overages, cancel after your audit"
        },
        {
          "value": "24 hrs",
          "label": "Time to your first dated SOC 2 gap report"
        },
        {
          "value": "10 docs",
          "label": "Auditor-requested policy documents drafted from your real config"
        },
        {
          "value": "~$50K",
          "label": "Typical consultant cost this replaces"
        }
      ],
      "title": "The numbers that matter to your board"
    },
    {
      "type": "how_it_works",
      "steps": [
        {
          "title": "Connect your stack read-only",
          "body": "Grant read-only OAuth access to AWS or GCP, GitHub, and your HRIS (Rippling, Gusto, BambooHR). No agents to install, no code changes, no elevated permissions."
        },
        {
          "title": "Receive your gap report in 24 hours",
          "body": "The AI agent maps your live configuration against the SOC 2 Trust Services Criteria, identifies every control gap, and delivers a dated, auditor-shareable PDF with evidence citations."
        },
        {
          "title": "Get every policy document drafted",
          "body": "Ten auditor-requested policies \u2014 Access Control, Change Management, Incident Response, and more \u2014 are generated with every clause anchored to a specific artifact pulled from your actual environment."
        },
        {
          "title": "Close gaps with a weekly remediation queue",
          "body": "Every week the agent re-scans your environment, surfaces new drift, and updates your prioritized remediation queue so you arrive at your Type I or Type II audit with zero surprises."
        }
      ],
      "title": "From connection to audit-ready in four steps",
      "subhead": "No professional-services kickoff. No 12-week onboarding. Just connect your stack and the agent goes to work."
    },
    {
      "type": "feature_spotlight",
      "items": [
        {
          "title": "Policies written from your config, not a template library",
          "body": "Generic policy templates fail auditors because they don't reflect your actual controls. Our agent reads your AWS IAM roles, GitHub branch protections, and HRIS offboarding flows, then writes policies whose clauses cite the exact resources they describe. Auditors see evidence, not assertions.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/6f440eb3-39c6-414b-9be6-a8a68cf915a5",
            "alt": "Policies written from your config, not a template library"
          }
        },
        {
          "title": "Weekly re-scans that catch drift before your auditor does",
          "body": "Infrastructure changes between your gap report and your audit window are the most common cause of last-minute surprises. The agent re-scans every seven days, flags new deviations, and keeps your remediation queue current \u2014 so your security posture on audit day matches what's on paper.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/944074f9-4bef-4b6c-8a9c-2e50f4783567",
            "alt": "Weekly re-scans that catch drift before your auditor does"
          }
        },
        {
          "title": "A dated gap report you can share with your board today",
          "body": "Enterprise prospects, lead investors, and board members asking for SOC 2 progress need something concrete now. Within 24 hours of connecting your stack you have a timestamped, professional gap report that demonstrates active, structured progress toward certification.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/2b195516-8c59-4eea-b925-09c3e96736fc",
            "alt": "A dated gap report you can share with your board today"
          }
        }
      ],
      "title": "Built for the technical co-founder with no compliance headcount"
    },
    {
      "type": "feature_grid",
      "features": [
        {
          "title": "AWS & GCP config ingestion",
          "body": "Read-only integration pulls IAM, VPC, CloudTrail, S3 policies, and GCP equivalents automatically \u2014 no manual exports."
        },
        {
          "title": "GitHub security posture",
          "body": "Branch protection rules, secret scanning status, and CODEOWNERS coverage are mapped directly to CC8 and related change-management controls."
        },
        {
          "title": "HRIS employee lifecycle",
          "body": "Onboarding and offboarding records from Rippling, Gusto, or BambooHR satisfy access provisioning and termination evidence requirements."
        },
        {
          "title": "10 auditor-ready policy docs",
          "body": "Access Control, Acceptable Use, Incident Response, Business Continuity, Change Management, and five more \u2014 each versioned and exportable as PDF or DOCX."
        },
        {
          "title": "Control-to-evidence mapping",
          "body": "Every Trust Services Criteria control is linked to the specific log, screenshot, or config artifact that satisfies it, formatted for Big Four and regional audit firms."
        },
        {
          "title": "Annual prepay option",
          "body": "Pay annually and lock in 10% off. Pause-and-resume is preserved \u2014 your evidence history and policy versions stay intact if you need to delay your audit window."
        }
      ],
      "title": "Everything included at $1,999/mo \u2014 nothing sold separately",
      "subhead": "One flat price covers the full prep cycle. Cancel the month after your audit closes."
    },
    {
      "type": "social_proof",
      "quotes": [
        {
          "quote": "We had an enterprise deal blocked on SOC 2. Within 48 hours we had a gap report we could share with the prospect and a clear remediation plan. Our consultant quote was $65K \u2014 we closed the deal before we would have even finished the consultant's kickoff.",
          "author": "CTO",
          "role": "Series A B2B SaaS, 40 employees, AWS + GitHub"
        },
        {
          "quote": "The policies it generated actually reflected our infrastructure. Our auditor said it was the most complete pre-audit package she'd seen from a company our size. We passed Type I in six weeks.",
          "author": "VP Engineering",
          "role": "Cloud-native SaaS, 28 employees, GCP"
        },
        {
          "quote": "I was the only technical person handling compliance alongside a full product roadmap. The weekly remediation queue meant I always knew the three things to fix next. No consultant calls, no status decks.",
          "author": "Technical Co-Founder",
          "role": "Series A SaaS, 22 employees"
        }
      ],
      "title": "What teams say after their first gap report"
    },
    {
      "type": "faq",
      "items": [
        {
          "q": "Will a real auditor accept AI-drafted policies?",
          "a": "Yes. Auditors evaluate whether policies accurately describe your controls and are backed by evidence \u2014 not who wrote them. Because every clause cites a real artifact from your environment, the policies are more defensible than generic templates a consultant would customize manually."
        },
        {
          "q": "What read-only permissions do you actually need?",
          "a": "For AWS: SecurityAudit and ReadOnlyAccess managed policies. For GCP: Viewer role. For GitHub: read-only OAuth on repositories and organization settings. For HRIS: read-only API token scoped to employee records. We publish the exact permission sets in our docs before you connect anything."
        },
        {
          "q": "Does this work for Type I and Type II, or just Type I?",
          "a": "Both. Type I prep typically takes 6\u201310 weeks with our weekly re-scan cadence. Type II requires a 3\u20136 month observation window \u2014 the agent tracks your control operation continuously throughout that period and surfaces evidence for each interval."
        },
        {
          "q": "What happens after our audit is done?",
          "a": "Cancel any time \u2014 there are no penalties and no minimum term beyond the current month. If you want to maintain your SOC 2 posture for annual surveillance audits, you can pause and resume your subscription without losing your evidence history or policy versions."
        },
        {
          "q": "We're not on AWS or GCP \u2014 can we still use this?",
          "a": "The current integrations cover AWS, GCP, GitHub, and the major HRIS platforms. Azure support is on the roadmap. If your stack is close but not exact, run the free scan \u2014 partial ingestion still produces a useful gap report and policy drafts for the controls we can map."
        }
      ],
      "title": "Questions CTOs ask before signing up"
    },
    {
      "type": "cta_band",
      "headline": "Your enterprise deal shouldn't wait 12 weeks for a consultant kickoff",
      "subhead": "Run a free gap scan today. Get your dated SOC 2 report in 24 hours. $1,999/mo flat \u2014 cancel the month your audit closes."
    }
  ]
};
