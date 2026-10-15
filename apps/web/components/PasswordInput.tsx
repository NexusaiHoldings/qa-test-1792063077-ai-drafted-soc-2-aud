/**
 * Password input with a show/hide eye toggle (substrate-auth-reset-001).
 *
 * Drop-in replacement for a styled password <input>. Keeps the field type
 * "password" by default; the eye button toggles to "text".
 */

"use client";

import { useState, type ChangeEvent, type JSX } from "react";

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  disabled = false,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
}): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        required
        style={{
          width: "100%",
          padding: "0.6rem 2.6rem 0.6rem 0.75rem",
          borderRadius: 7,
          border: "1px solid rgba(128,128,128,0.35)",
          fontSize: "0.95rem",
          boxSizing: "border-box",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          // Icon-sized square — explicit height/width + minHeight:0 + padding:0 override the
          // substrate's `main button { height: control-h; padding: 0 1rem }` rule (which otherwise
          // makes this a full control-height button: eye pushed off-center + a visible box).
          height: "1.75rem",
          width: "1.75rem",
          minHeight: 0,
          padding: 0,
          margin: 0,  // override `main button { margin-top: 1.25rem }` (form-button spacing) — without
                      // this the eye is pushed ~20px below the input's vertical center.
          background: "transparent",
          border: "none",
          borderRadius: 6,
          boxShadow: "none",  // override main button box-shadow (the faint box)
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          color: "rgba(0,0,0,0.5)",
        }}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
