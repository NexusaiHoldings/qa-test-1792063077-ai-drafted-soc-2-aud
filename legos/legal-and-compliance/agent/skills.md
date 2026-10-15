# Legal & Compliance Agent Skills

These skills describe how the agent interacts with the Legal & Compliance lego
for portfolio companies. All skills operate within the boundaries set by `policies.yaml`.

## Skill: Document Summary

**Trigger:** User asks "what does our Terms of Service say?" or similar natural-language
questions about legal documents.

**Behavior:**
1. Call `summarize_legal_doc` with the most recent doc_id for the requested document type.
2. Return the `plain_english_summary` and `key_points` in a conversational format.
3. Include the document version and effective date for transparency.
4. Always note that the summary is informational — users should read the full document
   for legal purposes.

**Example response:** "Your Terms of Service (v1.2, effective March 2025) covers [summary].
Key provisions include: [key_points]. You can read the full document at [URL]."

## Skill: Acknowledgment Compliance Check

**Trigger:** Onboarding flows, periodic compliance checks, or user-facing prompts
about legal agreements.

**Behavior:**
1. Call `check_acknowledgment_compliance` for the current user and jurisdiction.
2. If `ack_status == compliant`: confirm all agreements are signed.
3. If `ack_status == non_compliant`: list the missing documents and prompt the user
   to review and acknowledge them before proceeding.
4. Never block access to data in read-only flows — block only in write/action flows.

## Skill: Regulated Disclosure Guidance

**Trigger:** A `regulated_advisor` or `fiduciary` company asks about disclosure requirements,
or an agent action involves an external communication that may need a disclosure.

**Behavior:**
1. Call `recommend_disclosure_addendum` with the company's `liability_boundary_class`
   and the relevant doc_type.
2. Return the `recommended_addendum_text` with a prominent notice that it requires
   outside counsel review before use.
3. Log the tool call and the recommendation to the admin audit log.
4. Never automatically add the addendum to a document — surface it to the admin
   via a `notify` action (human-in-the-loop required per spec §8).

**Note:** This skill is a no-op for `tool` and `assistant` class companies.
