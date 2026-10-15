"use client";
import React, { useEffect, useState } from "react";

/** FileUploader — drag-and-drop upload + file list (slots: file_uploader / file_list). */
interface FileUploaderProps { apiBase?: string; userId: string; }
interface FileRow { id: string; filename: string; category?: string; scan_status: string; status: string; }

export function FileUploader({ apiBase = "", userId }: FileUploaderProps) {
  const [files, setFiles] = useState<FileRow[]>([]);

  async function refresh() {
    const res = await fetch(`${apiBase}/api/files?user_id=${encodeURIComponent(userId)}`);
    if (res.ok) { const d = await res.json(); setFiles(d.files ?? []); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [apiBase, userId]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
      <div style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: 24, textAlign: "center", color: "#64748b" }}>
        Drag files here, or use your upload control. Files are virus-scanned + categorized on arrival.
      </div>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
        {files.map((f) => (
          <li key={f.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1", display: "flex", justifyContent: "space-between" }}>
            <span>{f.filename}{f.category ? <span style={{ opacity: 0.5 }}> · {f.category}</span> : null}</span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{f.status === "quarantined" ? "⚠ quarantined" : f.scan_status}</span>
          </li>
        ))}
        {files.length === 0 && <li style={{ opacity: 0.6, padding: 8 }}>No files yet.</li>}
      </ul>
    </div>
  );
}
