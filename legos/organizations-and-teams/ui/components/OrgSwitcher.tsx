"use client";
import React from "react";

/**
 * OrgSwitcher — org dropdown for the app shell (slot: org_switcher).
 * Renders nothing when the user belongs to ≤1 org.
 */
interface Org {
  id: string;
  name: string;
}
interface OrgSwitcherProps {
  orgs: Org[];
  currentOrgId: string;
  onSwitch?: (orgId: string) => void;
}

export function OrgSwitcher({ orgs, currentOrgId, onSwitch }: OrgSwitcherProps) {
  if (!orgs || orgs.length <= 1) return null;
  return (
    <select
      value={currentOrgId}
      onChange={(e) => onSwitch?.(e.target.value)}
      aria-label="Switch organization"
      style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontFamily: "system-ui, sans-serif" }}
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
