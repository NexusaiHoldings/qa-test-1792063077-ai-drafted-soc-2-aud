"use client";
import React, { useEffect, useState } from "react";

/** OnboardingChecklist — first-run checklist (slot: onboarding_checklist). */
interface OnboardingChecklistProps { apiBase?: string; userId: string; }
interface Step { step_key: string; status: string; }

export function OnboardingChecklist({ apiBase = "", userId }: OnboardingChecklistProps) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`${apiBase}/api/onboarding/progress?user_id=${encodeURIComponent(userId)}`);
      if (active && res.ok) { const d = await res.json(); setSteps(d.progress ?? []); setPercent(d.percent ?? 0); }
    })();
    return () => { active = false; };
  }, [apiBase, userId]);

  if (percent >= 100 || steps.length === 0) return null;
  return (
    <div style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 10, fontFamily: "system-ui, sans-serif", maxWidth: 360 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Getting started · {percent}%</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((s) => (
          <li key={s.step_key} style={{ padding: "6px 0", display: "flex", gap: 8, opacity: s.status === "completed" ? 0.5 : 1 }}>
            <span>{s.status === "completed" ? "✓" : "○"}</span>
            <span style={{ textDecoration: s.status === "completed" ? "line-through" : "none" }}>
              {s.step_key.replace(/_/g, " ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
