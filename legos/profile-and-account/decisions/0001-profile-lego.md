# 0001 — Profile & Account lego

## Context
profile-and-account was a 16-LOC stub. Per §11 #2 it's the account-management
pillar on top of identity. Built after CRM in the stub build-out track.

## Decision
1. **Extends identity, doesn't duplicate it.** identity-and-access owns users +
   sessions + OAuth; this lego adds user_profiles (display/bio/timezone/prefs +
   completion score), connected_accounts (provider links), and
   account_export_requests (GDPR export jobs). depends_on: [identity-and-access].
2. **Four agent tools.** suggest_profile_completion / detect_stale_account /
   summarize_connected_accounts are read-only. request_account_export is the one
   genuine mutation (confirm) — the user authorizes a data export job.
3. **Export is request → job → ready, never synchronous.** request_account_export
   creates a 'requested' row; an export worker (future) processes it to 'ready'
   with a retention-bounded download link.

## Consequences
- Every portfolio company ships a profile editor + connected-accounts view +
  GDPR export, with agent nudges for completion + stale-account re-engagement.
- request_account_export's runtime→company-app execution rides the cross-boundary
  mutation bridge. The export-job worker (requested→ready) is a follow-on.
