"use client";

/**
 * FileManager — substrate-side upload + list + download for files-and-media
 * (substrate-lego-wiring-001 files gap-fill). The lego's FileUploader is
 * presentational (no upload POST), so the substrate supplies a working manager:
 * multipart upload → /api/files/upload, list → /api/files, download links →
 * /api/files/[id]/download. 10MB cap (enforced server-side too).
 */
import { useCallback, useEffect, useRef, useState, type JSX } from "react";

interface FileRow {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: string;
  status: string;
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileManager(): JSX.Element {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const d = await res.json();
        setFiles(d.files ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setError((await res.text()) || "Upload failed.");
      } else {
        await refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="block w-full text-sm text-gray-600"
        />
        <p className="mt-2 text-xs text-gray-400">Up to 10MB per file.</p>
      </div>

      {busy && <p className="text-sm text-gray-500">Uploading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-gray-500">No files yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded border border-gray-200">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <a
                    href={`/api/files/${encodeURIComponent(f.id)}/download`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {f.filename}
                  </a>
                  <div className="text-xs text-gray-400">
                    {humanSize(f.size_bytes)} · {f.status === "quarantined" ? "⚠ quarantined" : f.scan_status}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
