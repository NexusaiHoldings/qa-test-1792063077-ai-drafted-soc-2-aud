# 0001 — Social & Engagement lego
## Context
social-and-engagement was a 16-LOC stub. §11 #14: comments, reactions,
referrals, reviews.
## Decision
1. social_comments + social_reactions + social_referrals. Generic entity_type/
   entity_id so any product object can carry comments/reactions.
2. Four read-only agent tools (moderate verdict / review sentiment / spam
   detection / referral reward) + hide_comment (confirm). moderate_comment
   produces a verdict; hiding is the separate confirm-gated action.
## Consequences
Every portfolio company ships comments + reactions + referrals + an agent that
moderates + reads sentiment + detects spam. hide_comment rides the cross-boundary
bridge.
