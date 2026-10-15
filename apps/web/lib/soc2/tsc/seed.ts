/**
 * SOC 2 Trust Services Criteria knowledge base (F1-005, seed.ts).
 *
 * This is the "AICPA SOC 2 Trust Services Criteria embedded as a structured
 * knowledge base" named in ceo_briefing.ai_automation_core. It encodes the
 * 2017 Trust Services Criteria (with 2022 points of focus): the full Common
 * Criteria set CC1.1–CC9.2 plus Availability A1 and Confidentiality C1.
 *
 * Each control carries:
 *   - criteria_text   — the AICPA criterion statement
 *   - points_of_focus — the illustrative points of focus (2022 revision)
 *   - policy_document — which of the 10 company policies it belongs to
 *   - artifact_types  — the ingested-infrastructure artifact types that can
 *                       evidence it (consumed by rules.ts / mapper.ts)
 *
 * TSC_CONTROLS is the single source of truth: both the UI (static import, so
 * the control tree renders even before the first collection) and the database
 * seeder (`seedControls`) read from it. The table is GLOBAL reference data —
 * the criteria are identical for every tenant — so the seeder upserts on the
 * unique `code`.
 */

/** A thin structural Db type so this module never imports the pg adapter. */
export interface SeedDb {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

export interface TscControl {
  /** Criterion code, e.g. "CC7.2", "A1.1". Unique across the catalog. */
  readonly code: string;
  /** Category key for grouping/collapsing, e.g. "CC7", "A1". */
  readonly category: string;
  /** Human label for the category header. */
  readonly categoryLabel: string;
  readonly title: string;
  readonly criteriaText: string;
  readonly pointsOfFocus: readonly string[];
  /** One of SOC2_POLICY_DOCUMENTS. */
  readonly policyDocument: string;
  /** Artifact types that can evidence this control (see rules.ts). */
  readonly artifactTypes: readonly string[];
  readonly sortOrder: number;
}

export interface TscCategory {
  readonly category: string;
  readonly label: string;
  readonly order: number;
}

/**
 * The 10 named policy documents (ceo_briefing). Every control maps to exactly
 * one of these so evidence-anchored policy drafting (F1-DT00x) has a home.
 */
export const SOC2_POLICY_DOCUMENTS: readonly string[] = [
  "Information Security Policy",
  "Access Control Policy",
  "Change Management Policy",
  "Risk Assessment Policy",
  "Vendor & Third-Party Management Policy",
  "Incident Response Policy",
  "Business Continuity & Disaster Recovery Policy",
  "Data Classification & Handling Policy",
  "Human Resources Security Policy",
  "System Monitoring & Logging Policy",
];

/** Ordered category metadata for the collapsible tree + coverage meters. */
export const TSC_CATEGORIES: readonly TscCategory[] = [
  { category: "CC1", label: "CC1 — Control Environment", order: 1 },
  { category: "CC2", label: "CC2 — Communication & Information", order: 2 },
  { category: "CC3", label: "CC3 — Risk Assessment", order: 3 },
  { category: "CC4", label: "CC4 — Monitoring Activities", order: 4 },
  { category: "CC5", label: "CC5 — Control Activities", order: 5 },
  { category: "CC6", label: "CC6 — Logical & Physical Access Controls", order: 6 },
  { category: "CC7", label: "CC7 — System Operations", order: 7 },
  { category: "CC8", label: "CC8 — Change Management", order: 8 },
  { category: "CC9", label: "CC9 — Risk Mitigation", order: 9 },
  { category: "A1", label: "A1 — Availability", order: 10 },
  { category: "C1", label: "C1 — Confidentiality", order: 11 },
];

/**
 * The embedded TSC catalog. Point-of-focus text is condensed from the 2022
 * revision; artifact_types reference the ingested infrastructure artifacts that
 * the deterministic rules (rules.ts) and LLM fallback (mapper.ts) evaluate.
 */
export const TSC_CONTROLS: readonly TscControl[] = [
  // ─── CC1 Control Environment ────────────────────────────────────────────
  {
    code: "CC1.1",
    category: "CC1",
    categoryLabel: "Control Environment",
    title: "Commitment to integrity and ethical values",
    criteriaText:
      "The entity demonstrates a commitment to integrity and ethical values.",
    pointsOfFocus: [
      "Sets the tone at the top through a documented code of conduct.",
      "Establishes standards of conduct and evaluates adherence.",
      "Addresses deviations from expected conduct in a timely manner.",
    ],
    policyDocument: "Human Resources Security Policy",
    artifactTypes: ["hris_roster", "security_training"],
    sortOrder: 101,
  },
  {
    code: "CC1.2",
    category: "CC1",
    categoryLabel: "Control Environment",
    title: "Board independence and oversight",
    criteriaText:
      "The board of directors demonstrates independence from management and exercises oversight of the development and performance of internal control.",
    pointsOfFocus: [
      "Establishes oversight responsibilities independent of management.",
      "Applies relevant expertise to oversight activities.",
    ],
    policyDocument: "Information Security Policy",
    artifactTypes: [],
    sortOrder: 102,
  },
  {
    code: "CC1.3",
    category: "CC1",
    categoryLabel: "Control Environment",
    title: "Structure, authority and responsibility",
    criteriaText:
      "Management establishes, with board oversight, structures, reporting lines, and appropriate authorities and responsibilities in the pursuit of objectives.",
    pointsOfFocus: [
      "Considers all structures of the entity when assigning authority.",
      "Defines, assigns and limits authorities and responsibilities.",
    ],
    policyDocument: "Human Resources Security Policy",
    artifactTypes: ["hris_roster"],
    sortOrder: 103,
  },
  {
    code: "CC1.4",
    category: "CC1",
    categoryLabel: "Control Environment",
    title: "Commitment to competence",
    criteriaText:
      "The entity demonstrates a commitment to attract, develop, and retain competent individuals in alignment with objectives.",
    pointsOfFocus: [
      "Evaluates competence and addresses shortcomings.",
      "Provides security awareness training to personnel.",
    ],
    policyDocument: "Human Resources Security Policy",
    artifactTypes: ["security_training", "background_checks"],
    sortOrder: 104,
  },
  {
    code: "CC1.5",
    category: "CC1",
    categoryLabel: "Control Environment",
    title: "Accountability",
    criteriaText:
      "The entity holds individuals accountable for their internal control responsibilities in the pursuit of objectives.",
    pointsOfFocus: [
      "Establishes performance measures, incentives and rewards.",
      "Enforces accountability through structures and authorities.",
    ],
    policyDocument: "Human Resources Security Policy",
    artifactTypes: ["hris_roster"],
    sortOrder: 105,
  },

  // ─── CC2 Communication & Information ─────────────────────────────────────
  {
    code: "CC2.1",
    category: "CC2",
    categoryLabel: "Communication & Information",
    title: "Quality information for internal control",
    criteriaText:
      "The entity obtains or generates and uses relevant, quality information to support the functioning of internal control.",
    pointsOfFocus: [
      "Identifies information requirements for control objectives.",
      "Processes relevant data into quality information.",
    ],
    policyDocument: "System Monitoring & Logging Policy",
    artifactTypes: ["cloudwatch_logs", "gcp_audit_logs"],
    sortOrder: 201,
  },
  {
    code: "CC2.2",
    category: "CC2",
    categoryLabel: "Communication & Information",
    title: "Internal communication of control information",
    criteriaText:
      "The entity internally communicates information, including objectives and responsibilities for internal control, necessary to support the functioning of internal control.",
    pointsOfFocus: [
      "Communicates internal control information to personnel.",
      "Provides separate communication lines such as whistleblower channels.",
    ],
    policyDocument: "Information Security Policy",
    artifactTypes: ["security_training"],
    sortOrder: 202,
  },
  {
    code: "CC2.3",
    category: "CC2",
    categoryLabel: "Communication & Information",
    title: "External communication",
    criteriaText:
      "The entity communicates with external parties regarding matters affecting the functioning of internal control.",
    pointsOfFocus: [
      "Communicates with external parties about security commitments.",
      "Provides channels for external parties to report issues.",
    ],
    policyDocument: "Vendor & Third-Party Management Policy",
    artifactTypes: [],
    sortOrder: 203,
  },

  // ─── CC3 Risk Assessment ────────────────────────────────────────────────
  {
    code: "CC3.1",
    category: "CC3",
    categoryLabel: "Risk Assessment",
    title: "Objectives for risk identification",
    criteriaText:
      "The entity specifies objectives with sufficient clarity to enable the identification and assessment of risks relating to objectives.",
    pointsOfFocus: [
      "Specifies operations and compliance objectives.",
      "Considers the level of risk acceptable to achieve objectives.",
    ],
    policyDocument: "Risk Assessment Policy",
    artifactTypes: [],
    sortOrder: 301,
  },
  {
    code: "CC3.2",
    category: "CC3",
    categoryLabel: "Risk Assessment",
    title: "Risk identification and analysis",
    criteriaText:
      "The entity identifies risks to the achievement of its objectives across the entity and analyzes risks as a basis for determining how the risks should be managed.",
    pointsOfFocus: [
      "Identifies and assesses risks at entity and process levels.",
      "Analyzes significance and likelihood of identified risks.",
    ],
    policyDocument: "Risk Assessment Policy",
    artifactTypes: ["guardduty", "github_dependabot"],
    sortOrder: 302,
  },
  {
    code: "CC3.3",
    category: "CC3",
    categoryLabel: "Risk Assessment",
    title: "Fraud risk consideration",
    criteriaText:
      "The entity considers the potential for fraud in assessing risks to the achievement of objectives.",
    pointsOfFocus: [
      "Assesses incentives, pressures and opportunities for fraud.",
      "Considers how management could override controls.",
    ],
    policyDocument: "Risk Assessment Policy",
    artifactTypes: [],
    sortOrder: 303,
  },
  {
    code: "CC3.4",
    category: "CC3",
    categoryLabel: "Risk Assessment",
    title: "Assessment of change",
    criteriaText:
      "The entity identifies and assesses changes that could significantly impact the system of internal control.",
    pointsOfFocus: [
      "Assesses changes in the external environment and business model.",
      "Assesses changes in leadership and systems.",
    ],
    policyDocument: "Change Management Policy",
    artifactTypes: ["aws_config"],
    sortOrder: 304,
  },

  // ─── CC4 Monitoring Activities ──────────────────────────────────────────
  {
    code: "CC4.1",
    category: "CC4",
    categoryLabel: "Monitoring Activities",
    title: "Ongoing and separate evaluations",
    criteriaText:
      "The entity selects, develops, and performs ongoing and/or separate evaluations to ascertain whether the components of internal control are present and functioning.",
    pointsOfFocus: [
      "Integrates ongoing evaluations into business processes.",
      "Uses baselines to detect and investigate changes.",
    ],
    policyDocument: "System Monitoring & Logging Policy",
    artifactTypes: ["aws_config", "guardduty"],
    sortOrder: 401,
  },
  {
    code: "CC4.2",
    category: "CC4",
    categoryLabel: "Monitoring Activities",
    title: "Evaluation and communication of deficiencies",
    criteriaText:
      "The entity evaluates and communicates internal control deficiencies in a timely manner to those parties responsible for taking corrective action.",
    pointsOfFocus: [
      "Assesses results of evaluations and tracks remediation.",
      "Communicates deficiencies to responsible parties.",
    ],
    policyDocument: "Incident Response Policy",
    artifactTypes: ["guardduty", "github_dependabot"],
    sortOrder: 402,
  },

  // ─── CC5 Control Activities ─────────────────────────────────────────────
  {
    code: "CC5.1",
    category: "CC5",
    categoryLabel: "Control Activities",
    title: "Control activities for risk mitigation",
    criteriaText:
      "The entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives to acceptable levels.",
    pointsOfFocus: [
      "Integrates control activities with the risk assessment.",
      "Considers a mix of manual and automated control activities.",
    ],
    policyDocument: "Information Security Policy",
    artifactTypes: ["aws_config"],
    sortOrder: 501,
  },
  {
    code: "CC5.2",
    category: "CC5",
    categoryLabel: "Control Activities",
    title: "Technology general controls",
    criteriaText:
      "The entity also selects and develops general control activities over technology to support the achievement of objectives.",
    pointsOfFocus: [
      "Establishes relevant technology infrastructure control activities.",
      "Establishes relevant security management process controls.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: ["iam_password_policy", "kms_keys"],
    sortOrder: 502,
  },
  {
    code: "CC5.3",
    category: "CC5",
    categoryLabel: "Control Activities",
    title: "Policies and procedures deployment",
    criteriaText:
      "The entity deploys control activities through policies that establish what is expected and in procedures that put policies into action.",
    pointsOfFocus: [
      "Establishes policies and procedures to support deployment.",
      "Reassesses policies and procedures periodically.",
    ],
    policyDocument: "Information Security Policy",
    artifactTypes: [],
    sortOrder: 503,
  },

  // ─── CC6 Logical & Physical Access Controls ─────────────────────────────
  {
    code: "CC6.1",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Logical access security infrastructure",
    criteriaText:
      "The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events to meet the entity's objectives.",
    pointsOfFocus: [
      "Identifies and manages the inventory of information assets.",
      "Restricts logical access with authentication and authorization.",
      "Protects encryption keys during generation, storage and use.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: ["iam_password_policy", "iam_mfa", "kms_keys", "s3_encryption", "rds_encryption"],
    sortOrder: 601,
  },
  {
    code: "CC6.2",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "User registration and authorization",
    criteriaText:
      "Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users whose access is administered by the entity.",
    pointsOfFocus: [
      "Registers and authorizes users before granting access.",
      "Removes access when no longer required.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: ["iam_users", "github_collaborators", "hris_offboarding"],
    sortOrder: 602,
  },
  {
    code: "CC6.3",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Role-based access and least privilege",
    criteriaText:
      "The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles, responsibilities, or the system design and changes, giving consideration to the concepts of least privilege and segregation of duties.",
    pointsOfFocus: [
      "Creates and manages access based on roles and least privilege.",
      "Reviews access periodically and removes inappropriate access.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: ["iam_users", "github_collaborators", "gcp_iam"],
    sortOrder: 603,
  },
  {
    code: "CC6.4",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Physical access restriction",
    criteriaText:
      "The entity restricts physical access to facilities and protected information assets to authorized personnel to meet the entity's objectives.",
    pointsOfFocus: [
      "Restricts physical access to data centers and assets.",
      "Relies on cloud provider attestations for hosted infrastructure.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: [],
    sortOrder: 604,
  },
  {
    code: "CC6.5",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Asset disposal and data removal",
    criteriaText:
      "The entity discontinues logical and physical protections over physical assets only after the ability to read or recover data and software from those assets has been diminished and is no longer required to meet the entity's objectives.",
    pointsOfFocus: [
      "Removes data and software from assets before disposal.",
      "Uses cloud provider secure-deletion mechanisms.",
    ],
    policyDocument: "Data Classification & Handling Policy",
    artifactTypes: ["s3_encryption"],
    sortOrder: 605,
  },
  {
    code: "CC6.6",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Boundary protection against external threats",
    criteriaText:
      "The entity implements logical access security measures to protect against threats from sources outside its system boundaries.",
    pointsOfFocus: [
      "Restricts access from outside the system boundary.",
      "Protects identification and authentication credentials.",
    ],
    policyDocument: "Access Control Policy",
    artifactTypes: ["ec2_security_groups", "s3_public_access", "iam_mfa", "github_org_2fa"],
    sortOrder: 606,
  },
  {
    code: "CC6.7",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Data transmission and movement protection",
    criteriaText:
      "The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes, and protects it during transmission, movement, or removal to meet the entity's objectives.",
    pointsOfFocus: [
      "Encrypts data in transit between endpoints.",
      "Protects removable media and mobile devices.",
    ],
    policyDocument: "Data Classification & Handling Policy",
    artifactTypes: ["s3_encryption", "rds_encryption", "kms_keys"],
    sortOrder: 607,
  },
  {
    code: "CC6.8",
    category: "CC6",
    categoryLabel: "Logical & Physical Access Controls",
    title: "Malicious software prevention",
    criteriaText:
      "The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software to meet the entity's objectives.",
    pointsOfFocus: [
      "Detects unauthorized or malicious software.",
      "Scans dependencies and remediates vulnerable components.",
    ],
    policyDocument: "System Monitoring & Logging Policy",
    artifactTypes: ["guardduty", "github_dependabot"],
    sortOrder: 608,
  },

  // ─── CC7 System Operations ──────────────────────────────────────────────
  {
    code: "CC7.1",
    category: "CC7",
    categoryLabel: "System Operations",
    title: "Vulnerability detection and configuration monitoring",
    criteriaText:
      "To meet its objectives, the entity uses detection and monitoring procedures to identify (1) changes to configurations that result in the introduction of new vulnerabilities, and (2) susceptibilities to newly discovered vulnerabilities.",
    pointsOfFocus: [
      "Uses configuration monitoring against a defined baseline.",
      "Conducts vulnerability scans and reviews results.",
    ],
    policyDocument: "System Monitoring & Logging Policy",
    artifactTypes: ["aws_config", "github_dependabot", "guardduty"],
    sortOrder: 701,
  },
  {
    code: "CC7.2",
    category: "CC7",
    categoryLabel: "System Operations",
    title: "Security event monitoring and anomaly detection",
    criteriaText:
      "The entity monitors system components and the operation of those components for anomalies that are indicative of malicious acts, natural disasters, and errors affecting the entity's ability to meet its objectives; anomalies are analyzed to determine whether they represent security events.",
    pointsOfFocus: [
      "Implements detection policies, procedures and tools.",
      "Monitors audit trails across the environment, including all regions.",
      "Analyzes anomalies to determine whether they are security events.",
    ],
    policyDocument: "System Monitoring & Logging Policy",
    artifactTypes: ["cloudtrail", "guardduty", "cloudwatch_logs", "gcp_audit_logs"],
    sortOrder: 702,
  },
  {
    code: "CC7.3",
    category: "CC7",
    categoryLabel: "System Operations",
    title: "Security incident evaluation",
    criteriaText:
      "The entity evaluates security events to determine whether they could or have resulted in a failure of the entity to meet its objectives (security incidents) and, if so, takes actions to prevent or address such failures.",
    pointsOfFocus: [
      "Responds to and evaluates detected security events.",
      "Determines whether events constitute reportable incidents.",
    ],
    policyDocument: "Incident Response Policy",
    artifactTypes: ["guardduty", "cloudwatch_logs"],
    sortOrder: 703,
  },
  {
    code: "CC7.4",
    category: "CC7",
    categoryLabel: "System Operations",
    title: "Incident response program",
    criteriaText:
      "The entity responds to identified security incidents by executing a defined incident response program to understand, contain, remediate, and communicate security incidents, as appropriate.",
    pointsOfFocus: [
      "Executes a documented incident response plan.",
      "Contains, remediates and communicates incidents.",
    ],
    policyDocument: "Incident Response Policy",
    artifactTypes: ["guardduty"],
    sortOrder: 704,
  },
  {
    code: "CC7.5",
    category: "CC7",
    categoryLabel: "System Operations",
    title: "Recovery from security incidents",
    criteriaText:
      "The entity identifies, develops, and implements activities to recover from identified security incidents.",
    pointsOfFocus: [
      "Restores affected environments to known good states.",
      "Improves response procedures using lessons learned.",
    ],
    policyDocument: "Business Continuity & Disaster Recovery Policy",
    artifactTypes: ["rds_backups"],
    sortOrder: 705,
  },

  // ─── CC8 Change Management ──────────────────────────────────────────────
  {
    code: "CC8.1",
    category: "CC8",
    categoryLabel: "Change Management",
    title: "Change authorization and deployment",
    criteriaText:
      "The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives.",
    pointsOfFocus: [
      "Requires peer review and approval before merging changes.",
      "Protects production branches and tests changes before release.",
    ],
    policyDocument: "Change Management Policy",
    artifactTypes: ["github_branch_protection", "github_required_reviews"],
    sortOrder: 801,
  },

  // ─── CC9 Risk Mitigation ────────────────────────────────────────────────
  {
    code: "CC9.1",
    category: "CC9",
    categoryLabel: "Risk Mitigation",
    title: "Risk mitigation for business disruptions",
    criteriaText:
      "The entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.",
    pointsOfFocus: [
      "Develops business continuity and recovery plans.",
      "Considers insurance to mitigate financial impact of disruptions.",
    ],
    policyDocument: "Business Continuity & Disaster Recovery Policy",
    artifactTypes: ["rds_backups"],
    sortOrder: 901,
  },
  {
    code: "CC9.2",
    category: "CC9",
    categoryLabel: "Risk Mitigation",
    title: "Vendor and business partner risk management",
    criteriaText:
      "The entity assesses and manages risks associated with vendors and business partners.",
    pointsOfFocus: [
      "Assesses vendor risk before and during engagements.",
      "Establishes requirements and monitors vendor compliance.",
    ],
    policyDocument: "Vendor & Third-Party Management Policy",
    artifactTypes: [],
    sortOrder: 902,
  },

  // ─── A1 Availability ────────────────────────────────────────────────────
  {
    code: "A1.1",
    category: "A1",
    categoryLabel: "Availability",
    title: "Capacity management",
    criteriaText:
      "The entity maintains, monitors, and evaluates current processing capacity and use of system components to manage capacity demand and to enable the implementation of additional capacity to help meet its objectives.",
    pointsOfFocus: [
      "Monitors current usage against capacity thresholds.",
      "Forecasts and provisions additional capacity as needed.",
    ],
    policyDocument: "Business Continuity & Disaster Recovery Policy",
    artifactTypes: ["cloudwatch_logs"],
    sortOrder: 1001,
  },
  {
    code: "A1.2",
    category: "A1",
    categoryLabel: "Availability",
    title: "Environmental protections, backup and recovery infrastructure",
    criteriaText:
      "The entity authorizes, designs, develops or acquires, implements, operates, approves, maintains, and monitors environmental protections, software, data backup processes, and recovery infrastructure to meet its objectives.",
    pointsOfFocus: [
      "Implements automated data backups with retention.",
      "Protects against environmental threats via cloud provider controls.",
    ],
    policyDocument: "Business Continuity & Disaster Recovery Policy",
    artifactTypes: ["rds_backups", "s3_encryption"],
    sortOrder: 1002,
  },
  {
    code: "A1.3",
    category: "A1",
    categoryLabel: "Availability",
    title: "Recovery plan testing",
    criteriaText:
      "The entity tests recovery plan procedures supporting system recovery to meet its objectives.",
    pointsOfFocus: [
      "Tests backup restoration and recovery procedures periodically.",
      "Documents results and remediates gaps.",
    ],
    policyDocument: "Business Continuity & Disaster Recovery Policy",
    artifactTypes: ["rds_backups"],
    sortOrder: 1003,
  },

  // ─── C1 Confidentiality ─────────────────────────────────────────────────
  {
    code: "C1.1",
    category: "C1",
    categoryLabel: "Confidentiality",
    title: "Identification and maintenance of confidential information",
    criteriaText:
      "The entity identifies and maintains confidential information to meet the entity's objectives related to confidentiality.",
    pointsOfFocus: [
      "Classifies information to identify confidential data.",
      "Protects confidential information throughout its lifecycle.",
    ],
    policyDocument: "Data Classification & Handling Policy",
    artifactTypes: ["s3_encryption", "rds_encryption", "s3_public_access"],
    sortOrder: 1101,
  },
  {
    code: "C1.2",
    category: "C1",
    categoryLabel: "Confidentiality",
    title: "Disposal of confidential information",
    criteriaText:
      "The entity disposes of confidential information to meet the entity's objectives related to confidentiality.",
    pointsOfFocus: [
      "Removes confidential information when no longer required.",
      "Uses secure deletion and key destruction for disposal.",
    ],
    policyDocument: "Data Classification & Handling Policy",
    artifactTypes: ["kms_keys", "s3_encryption"],
    sortOrder: 1102,
  },
];

/** Lookup a single control by its code (e.g. for the [controlId] detail page). */
export function getControl(code: string): TscControl | undefined {
  const normalized = code.trim().toUpperCase();
  return TSC_CONTROLS.find((c) => c.code.toUpperCase() === normalized);
}

/** Controls grouped by category in display order. */
export function controlsByCategory(): Array<{ category: TscCategory; controls: TscControl[] }> {
  return TSC_CATEGORIES.map((category) => ({
    category,
    controls: TSC_CONTROLS.filter((c) => c.category === category.category).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
  })).filter((group) => group.controls.length > 0);
}

/**
 * Seed (upsert) the TSC catalog into soc2_controls. Global reference data keyed
 * by the unique `code`, so re-running is idempotent and picks up catalog edits.
 * Returns the number of controls written.
 */
export async function seedControls(db: SeedDb): Promise<number> {
  let count = 0;
  for (const control of TSC_CONTROLS) {
    await db.execute(
      `INSERT INTO soc2_controls
         (code, category, category_label, title, criteria_text,
          points_of_focus, policy_document, artifact_types, sort_order, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, now())
       ON CONFLICT (code) DO UPDATE SET
         category = EXCLUDED.category,
         category_label = EXCLUDED.category_label,
         title = EXCLUDED.title,
         criteria_text = EXCLUDED.criteria_text,
         points_of_focus = EXCLUDED.points_of_focus,
         policy_document = EXCLUDED.policy_document,
         artifact_types = EXCLUDED.artifact_types,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      control.code,
      control.category,
      control.categoryLabel,
      control.title,
      control.criteriaText,
      JSON.stringify(control.pointsOfFocus),
      control.policyDocument,
      JSON.stringify(control.artifactTypes),
      control.sortOrder,
    );
    count += 1;
  }
  return count;
}
