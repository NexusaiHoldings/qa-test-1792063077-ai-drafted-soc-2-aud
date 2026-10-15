# Social & Engagement — Agent Skills

## moderate_comment
Evaluate a comment (toxicity/spam/off-topic) → verdict + reason. Read-only;
hiding is separate. **Output:** `{ verdict, reason, confidence }`

## summarize_review_sentiment
Summarize review sentiment + themes. Read-only.
**Output:** `{ overall_sentiment, themes[] }`

## detect_spam_engagement
Flag inauthentic engagement patterns + risk. Read-only.
**Output:** `{ flags[], risk_level }`

## suggest_referral_reward
Suggest an appropriate referral reward from conversion + policy. Read-only.
**Output:** `{ suggested_reward, rationale }`

## hide_comment
Hide a comment. GENUINE MODERATION MUTATION — gated behind **confirm**
(moderator approves). **Output:** `{ comment_id, status }`
