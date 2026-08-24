"use client";

import { useEffect, useState } from "react";
import { attachmentUrl } from "@/lib/api";
import { IconDoc } from "@/components/Icons";

export interface Att {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
}

export const kindOf = (m: string): "IMAGE" | "VOICE" | "DOCUMENT" =>
  m.startsWith("image/") ? "IMAGE" : m.startsWith("audio/") ? "VOICE" : "DOCUMENT";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Resolves a short-lived signed URL, then renders the media. Signing is a
 * round-trip, so the element is rendered only once the link is ready — a
 * blank <img src=""> would otherwise flash a broken-image icon.
 */
export function AttachmentMedia({
  attachment,
  onZoom,
}: {
  attachment: Att;
  onZoom?: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const kind = kindOf(attachment.mimeType);

  useEffect(() => {
    let cancelled = false;
    attachmentUrl(attachment.id)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  if (failed) {
    return (
      <div className="m-doc" style={{ opacity: 0.75 }}>
        <IconDoc size={26} />
        <span style={{ minWidth: 0 }}>
          <span className="d-name">{attachment.originalName ?? "Attachment"}</span>
          <span className="d-meta">unavailable — downloads may be disabled</span>
        </span>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className="m-doc"
        style={{ opacity: 0.6, minWidth: 190 }}
        aria-busy="true"
        aria-label="Loading attachment"
      >
        <IconDoc size={26} />
        <span className="d-meta">loading…</span>
      </div>
    );
  }

  if (kind === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="m-img"
        src={url}
        alt={attachment.originalName ?? "Photo"}
        onClick={() => onZoom?.(url)}
      />
    );
  }

  if (kind === "VOICE") {
    return <audio className="m-audio" controls src={url} />;
  }

  return (
    <a className="m-doc" href={url} target="_blank" rel="noreferrer">
      <IconDoc size={30} />
      <span style={{ minWidth: 0 }}>
        <span className="d-name">{attachment.originalName ?? "Document"}</span>
        <span className="d-meta">{bytes(attachment.sizeBytes)}</span>
      </span>
    </a>
  );
}
