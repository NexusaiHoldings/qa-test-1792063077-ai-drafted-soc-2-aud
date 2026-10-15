# Slots Reference — identity-and-access

## `before_signup_fields` (react-component)
Rendered above the email input on `SignupForm`. Inject referral codes, plan pickers, etc.
```tsx
<SignupForm beforeSignupFields={<input name="company" placeholder="Company name" />} />
```

## `signup_legal_acknowledgment` (react-component)
Rendered below confirm-password. Defaults to a ToS/privacy placeholder; full template ships in 2.2.
```tsx
<SignupForm legalAcknowledgment={<label><input type="checkbox" required /> I agree</label>} />
```

## `after_login_redirect` (server-hook)
Called with the session token after a successful login. Responsible for storing the token and redirecting.
Falls back to `/dashboard` when not configured.
```tsx
<LoginForm afterLoginRedirect={(token) => {
  document.cookie = `session=${token}; Path=/; SameSite=Lax`;
  window.location.href = "/app/home";
}} />
```
