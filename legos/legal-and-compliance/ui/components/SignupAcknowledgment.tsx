/**
 * SignupAcknowledgment — fills the signup_legal_acknowledgment slot from Identity & Access.
 * Renders ToS + Privacy Policy checkboxes; blocks signup until both are checked.
 * Persists acknowledgment after user_id is created by calling POST /api/legal/acknowledge.
 */
"use client";
import React, { useState, useEffect } from "react";

interface DocRef {
  docId: string;
  version: string;
  url: string;
}

interface SignupAcknowledgmentProps {
  tosDoc: DocRef;
  privacyDoc: DocRef;
  onAcknowledged: (docIds: string[]) => void;
  disabled?: boolean;
}

export function SignupAcknowledgment({
  tosDoc,
  privacyDoc,
  onAcknowledged,
  disabled = false,
}: SignupAcknowledgmentProps) {
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  const allChecked = tosChecked && privacyChecked;

  // Notify parent component whenever both are checked
  useEffect(() => {
    if (allChecked) {
      onAcknowledged([tosDoc.docId, privacyDoc.docId]);
    }
  }, [allChecked, tosDoc.docId, privacyDoc.docId, onAcknowledged]);

  return (
    <div className="signup-legal-acknowledgment space-y-3 text-sm text-gray-700">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
          checked={tosChecked}
          onChange={(e) => setTosChecked(e.target.checked)}
          disabled={disabled}
          required
        />
        <span>
          I agree to the{" "}
          <a
            href={tosDoc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Terms of Service
          </a>{" "}
          <span className="text-gray-400">(v{tosDoc.version})</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
          checked={privacyChecked}
          onChange={(e) => setPrivacyChecked(e.target.checked)}
          disabled={disabled}
          required
        />
        <span>
          I have read and agree to the{" "}
          <a
            href={privacyDoc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Privacy Policy
          </a>{" "}
          <span className="text-gray-400">(v{privacyDoc.version})</span>
        </span>
      </label>

      {!allChecked && (
        <p className="text-xs text-gray-400 pl-7">
          Both agreements are required to continue.
        </p>
      )}
    </div>
  );
}

/** Persist acknowledgments for a newly created user. Call after user_id is available. */
export async function persistAcknowledgments(
  userId: string,
  docIds: string[]
): Promise<void> {
  await Promise.all(
    docIds.map((docId) =>
      fetch("/api/legal/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify({ doc_id: docId }),
      })
    )
  );
}
