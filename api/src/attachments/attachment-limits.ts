export const ALLOWED_MIME_TYPES: Record<string, { kind: "IMAGE" | "VOICE" | "DOCUMENT"; extension: string; maxBytes: number }> = {
  "image/jpeg": { kind: "IMAGE", extension: ".jpg", maxBytes: 10 * 1024 * 1024 },
  "image/png": { kind: "IMAGE", extension: ".png", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { kind: "IMAGE", extension: ".webp", maxBytes: 10 * 1024 * 1024 },
  "image/gif": { kind: "IMAGE", extension: ".gif", maxBytes: 10 * 1024 * 1024 },
  "audio/webm": { kind: "VOICE", extension: ".webm", maxBytes: 15 * 1024 * 1024 },
  "audio/ogg": { kind: "VOICE", extension: ".ogg", maxBytes: 15 * 1024 * 1024 },
  "audio/mpeg": { kind: "VOICE", extension: ".mp3", maxBytes: 15 * 1024 * 1024 },
  "audio/mp4": { kind: "VOICE", extension: ".m4a", maxBytes: 15 * 1024 * 1024 },
  "application/pdf": { kind: "DOCUMENT", extension: ".pdf", maxBytes: 25 * 1024 * 1024 },
  "application/msword": { kind: "DOCUMENT", extension: ".doc", maxBytes: 25 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "DOCUMENT",
    extension: ".docx",
    maxBytes: 25 * 1024 * 1024,
  },
  "application/vnd.ms-excel": { kind: "DOCUMENT", extension: ".xls", maxBytes: 25 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "DOCUMENT",
    extension: ".xlsx",
    maxBytes: 25 * 1024 * 1024,
  },
  "text/plain": { kind: "DOCUMENT", extension: ".txt", maxBytes: 5 * 1024 * 1024 },
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
