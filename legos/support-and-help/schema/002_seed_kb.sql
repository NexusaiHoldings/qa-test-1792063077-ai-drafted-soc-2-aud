-- Support & Help — seed KB articles (substrate-lego-wiring-001 Phase 2)
-- Two generic getting-started articles so a freshly-deployed company's Help
-- Center is not empty. Idempotent: ON CONFLICT (slug) DO NOTHING, so a company
-- that authors its own KB (or re-runs migrate) is never clobbered.

INSERT INTO kb_articles (slug, title, body, category, status)
VALUES
  (
    'getting-started',
    'Getting started',
    E'Welcome! This guide covers the basics.\n\n'
    'Creating your account\n'
    '- Sign up from the home page and verify your email.\n'
    '- You can update your name, timezone, and preferences any time under Account.\n\n'
    'Working with your team\n'
    '- Visit Organization to see your team members and invite teammates by email.\n'
    '- Invited teammates accept from the link we email them.\n\n'
    'Getting help\n'
    '- Search this Help Center for answers.\n'
    '- Still stuck? Use the support button in the corner of any page to open a ticket — '
    'our team (and AI assistant) will get back to you.',
    'basics',
    'published'
  ),
  (
    'contact-support',
    'How to contact support',
    E'We are here to help.\n\n'
    'Open a ticket\n'
    '- Click the support button in the bottom corner of any page.\n'
    '- Describe your question; we will suggest relevant articles first, then open a ticket '
    'if you still need a person.\n\n'
    'Track your tickets\n'
    '- Visit the Support page to see the status of every ticket you have opened and to reply '
    'to our responses.\n\n'
    'Response times\n'
    '- Most questions get a first response quickly. Urgent issues are escalated to a human '
    'operator automatically.',
    'basics',
    'published'
  )
ON CONFLICT (slug) DO NOTHING;
