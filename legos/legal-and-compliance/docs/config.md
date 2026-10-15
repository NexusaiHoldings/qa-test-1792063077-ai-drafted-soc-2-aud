# Legal & Compliance — Configuration Reference

## Required configuration

All three keys are required (`required_config: true`). Install-time will fail
without them.

---

### `jurisdiction`

**Type:** `string` (enum)
**Default:** `us`
**Values:** `us` | `eu` | `uk` | `ca` | `au` | `global`

Controls which jurisdiction's legal requirements apply to this company's
document templates and cookie consent defaults.

| Value | Coverage |
|-------|---------|
| `us` | United States (CCPA-aware, default) |
| `eu` | European Union (GDPR-strict; cookie banner defaults to rejected_all) |
| `uk` | United Kingdom (UK GDPR + PECR) |
| `ca` | Canada (PIPEDA / Quebec Law 25) |
| `au` | Australia (Privacy Act 1988) |
| `global` | No jurisdiction-specific overrides; use for globally-distributed products |

**Important:** Changing `jurisdiction` after launch requires re-acknowledgment
of all documents by existing users. Use `POST /admin/legal/force-reacknowledge`
for each affected document.

---

### `cookie_banner_enabled`

**Type:** `boolean`
**Default:** `true`

When `true`, the `CookieBanner` component is shown to new visitors who have
no consent on file. When `false`, the banner is suppressed — use only for
internal-facing tools or when consent is collected through another mechanism.

**EU/UK requirement:** If `jurisdiction` is `eu` or `uk`, this field MUST
remain `true`. The lego emits a warning at startup if it detects a mismatch.

---

### `liability_boundary_class`

**Type:** `string` (enum)
**Default:** `assistant`
**Values:** `tool` | `assistant` | `fiduciary` | `regulated_advisor`

Mirrors Spec §8. Controls the strictness of disclosure flows throughout the
legal lego and influences the `recommend_disclosure_addendum` agent tool.

| Class | Description | Additional requirements |
|-------|-------------|------------------------|
| `tool` | Pure software tool; no advisory relationship | None |
| `assistant` | AI-assisted; makes recommendations but not binding | None (default) |
| `fiduciary` | Legal/financial fiduciary duty to users | Additional disclosures in ToS; `requires_legal_review=true` for any addendum |
| `regulated_advisor` | Regulated professional context (investment advisor, medical, legal) | Full disclosure suite; outside counsel review REQUIRED before install |

**⚠️ Warning:** For `fiduciary` or `regulated_advisor` companies, the default
placeholder document templates are NOT suitable for production use. Outside
counsel review is required per spec §8 and ADR 0009 before real users can
interact with these documents. The lego will emit a startup warning for these
classes.
