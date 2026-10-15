# Portfolio Substrate

The canonical Next.js monorepo every portfolio company is built from. **Copied per company at provision time — never re-coded.**

## What this is

This directory is the **single source of truth** for the shape of every portfolio company Nexus builds. At provisioning time, `services/coding-pipeline/workers/_substrate_installer.py` copies this entire tree into the new company's GitHub repo, fills in company-specific values (name, slug), and runs `_legos_config_generator.py` to wire up `apps/web/lib/legos.config.ts` from every lego's manifest.

Companies don't get different scaffolds. They get the same substrate + their domain-specific business logic on top.

## What's owned by whom

| Layer | Owner | Where |
|-------|-------|-------|
| Substrate skeleton (this directory) | Chairman-approved sprints against `templates/portfolio-substrate/` | DENY_LIST for all agents |
| Legos (16 capability modules) | Per-lego sprints under chairman approval | DENY_LIST for all agents |
| Company-specific domain code | Coding agent during portfolio build | `apps/web/app/(domain)/` + `apps/web/lib/<domain>/` only |

## Layout

```
templates/portfolio-substrate/
├── apps/
│   └── web/                    # Next.js app (App Router)
│       ├── app/
│       │   ├── layout.tsx      # Shared root layout
│       │   ├── page.tsx        # Conversation surface (primary, spec §6.1)
│       │   ├── work/           # Work surface (spec §6.2)
│       │   ├── approval/       # Approval surface (spec §6.3)
│       │   ├── artifact/       # Artifact surface (spec §6.4)
│       │   ├── direct/         # Direct Control fallback (spec §6.5)
│       │   ├── api/health/     # Health check
│       │   └── (domain)/       # ← CARVED OUT — coding agent owns this
│       ├── components/
│       │   └── conversation/   # ConversationSurface primitive
│       └── lib/
│           ├── legos.config.ts # GENERATED — slot wiring from manifests
│           └── runtime.ts      # Runtime client wrapper
├── packages/
│   ├── db/                     # Drizzle schema (union of lego schemas)
│   ├── ui/                     # Shared design tokens + a11y primitives
│   └── runtime-client/         # Typed client for portfolio-runtime
├── legos/                      # Workspace symlinks → ../../legos/* at install
├── package.json                # Root workspace
├── turbo.json                  # Turbo 2.0 task graph
├── tsconfig.json
├── vercel.json
└── .env.example
```

## How a new portfolio company gets one

1. Chairman approves a portfolio plan
2. Provisioning runs `repo_setup`, `hosting_setup`, `db_setup`, `domain_provisioner`, `env_injection`
3. **Sprint_planner stage 0 invokes `_substrate_installer.install_substrate(repo_path, slug)`**
4. Installer copies this template into the company's repo + writes `legos.config.ts` from all 16 lego manifests
5. Stage 1+ tasks are the coding agent writing ONLY company-specific business logic in `apps/web/app/(domain)/`

## Conventions for portfolio agents

### `maxDuration` per route (use per-file export, not `vercel.json` globs)

Vercel's default serverless function timeout is **10 seconds**. The substrate's `vercel.json` deliberately does NOT set a global `functions` glob — global globs fail the entire deployment with `unused_function` whenever `next build` itself fails, masking the real build error (cycle 10 spent ~90 min debugging this exact masking).

**When you add a route that needs more than 10 seconds**, declare it INSIDE the route file:

```ts
// apps/web/app/(domain)/api/heavy-route/route.ts
export const maxDuration = 60;   // 60 seconds for LLM calls / file parsing

export async function POST(req: Request) { /* ... */ }
```

Common values:
- `10` (default) — quick DB queries, simple lookups, health checks
- `60` — single LLM call, document parsing, embedding generation
- `300` — long cron jobs, batch processing (max on Vercel Pro)

If you need cron behavior, add to `vercel.json` `crons: [{ "path": "...", "schedule": "..." }]` AND set `export const maxDuration = 300` in the cron route's file.

### Admin console + seeded test accounts (every build)

The substrate mounts the `@nexus/admin-console` lego at **`/admin`** (Feature Flags, System Config, Audit Log), backed by `/api/admin/*` route shims. Admin authorization is **session-user-based**: a logged-in user whose email is in `ADMIN_EMAILS` (default `admintest@nexusaiholdings.com`) is an admin. The lego's static `X-Admin-Token` is supplied server-side by the shims (`lib/admin-auth.ts` → `adminToken()`) and is **never** sent to the browser. `TopNav` shows the "Admin" link only to admins. Don't add `/admin` to `nav-config.ts`.

`packages/db/migrate.ts` seeds two fixed accounts into **every build** (idempotent, best-effort), for testing:

| Email | Role | Default password | Override env |
|---|---|---|---|
| `testuser@nexusaiholdings.com` | regular user | `TestUser!2026` | `TEST_USER_PASSWORD` |
| `admintest@nexusaiholdings.com` | admin (in `ADMIN_EMAILS`) | `AdminTest!2026` | `ADMIN_TEST_PASSWORD` |

Seeding is gated by `SEED_TEST_USERS` (default on). **SECURITY: set `SEED_TEST_USERS=false` before any real customer launch** — these are incubation-phase test accounts. Migrate also seeds the `admin_sections` rows so the admin nav lists the bundled pages.

### Auth: redirect unauthenticated users to `/login` (a page), never to `/api/auth/login` (POST-only)

The substrate ships `/login` and `/signup` **pages** plus `/api/auth/{login,signup,logout,session}` **API routes**. The API routes are POST-only — a server-side `redirect("/api/auth/login")` makes the browser issue a GET against a POST handler → **HTTP 405** (this is exactly how Buildspec's "Projects" links broke, 2026-06-01).

**When an auth-gated server component has no session, redirect to the page:**

```ts
import { redirect } from "next/navigation";
// ...
const session = await getSession();
if (!session) redirect("/login");                       // ✅ renders the form
// or, to return the user to where they were:
if (!session) redirect(`/login?redirect=${encodeURIComponent("/projects")}`);
```

The `/login` page POSTs to `/api/auth/login`, which sets the `session_token` HttpOnly cookie on success, then navigates to `?redirect=` (or `/`). Auth-gated pages read the session via `cookies().get("session_token")` + `handleSession(...)`. The lego DB tables (`users`, `sessions`, …) are created at build time by `packages/db/migrate.ts`, which applies every `legos/*/schema/*.sql`.

## Hard rules

- **No agent ever edits this directory.** DENY_LIST blocks both self-builds and portfolio sprints from touching `templates/portfolio-substrate/`. Substrate changes ship via direct-coded chairman sprints under `sprints/active/portfolio-substrate-*`.
- **Substrate `next build` must always exit 0.** CI runs this on every PR that touches this directory. Zero tolerance for build errors here — every company inherits any issue.
- **Lego version pinning is EXACT.** Root `package.json` pins every `@nexus/<lego>` to an exact version. Patches do NOT auto-flow per spec §4.8 (overridden — see ADR). Bumps ship at next substrate sprint.

## Spec authority

- `NEXUS_PORTFOLIO_RUNTIME_SPEC.md` — full architectural spec
- `sprints/active/portfolio-substrate-template-001.md` — sprint contract that built this directory
- `decisions/0024-substrate-as-copyable-template.md` — ADR (substrate-as-template + all-16-bundled + exact-pin-no-auto-patch)
