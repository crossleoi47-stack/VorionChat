export type DlpMode = "off" | "warn" | "flag" | "block";

export interface DlpConfig {
  mode: DlpMode;
  detectPhones: boolean;
  detectEmails: boolean;
  detectUrls: boolean;
  blockedPhrases: string[];
}

export const DEFAULT_DLP: DlpConfig = {
  mode: "flag",
  detectPhones: true,
  detectEmails: true,
  detectUrls: false,
  blockedPhrases: [
    "whatsapp me",
    "message me on",
    "my personal number",
    "call me directly",
    "my private number",
  ],
};

export interface DlpHit {
  kind: "phone" | "email" | "url" | "phrase";
  match: string;
}

// Deliberately loose on phones: 8+ digits with common separators, so
// "0 5 0 1 2 3 4 5 6 7" and "+971-50-123-4567" both trip it. False positives
// are cheap (a warning); a missed personal number is the expensive case.
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;

/** Long digit runs are usually order/invoice numbers, not phone numbers. */
function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function scanText(text: string, config: DlpConfig): DlpHit[] {
  if (!text || config.mode === "off") return [];
  const hits: DlpHit[] = [];

  if (config.detectPhones) {
    for (const m of text.match(PHONE_RE) ?? []) {
      if (looksLikePhone(m)) hits.push({ kind: "phone", match: m.trim() });
    }
  }
  if (config.detectEmails) {
    for (const m of text.match(EMAIL_RE) ?? []) hits.push({ kind: "email", match: m });
  }
  if (config.detectUrls) {
    for (const m of text.match(URL_RE) ?? []) hits.push({ kind: "url", match: m });
  }

  const lower = text.toLowerCase();
  for (const phrase of config.blockedPhrases ?? []) {
    const p = phrase.trim().toLowerCase();
    if (p && lower.includes(p)) hits.push({ kind: "phrase", match: phrase });
  }

  return hits;
}

export function describeHits(hits: DlpHit[]): string {
  const kinds = [...new Set(hits.map((h) => h.kind))];
  const names: Record<DlpHit["kind"], string> = {
    phone: "a phone number",
    email: "an email address",
    url: "a link",
    phrase: "a restricted phrase",
  };
  return kinds.map((k) => names[k]).join(" and ");
}
