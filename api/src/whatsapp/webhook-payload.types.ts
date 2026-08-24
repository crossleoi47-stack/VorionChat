// Simplified shape of a Meta WhatsApp Cloud API webhook payload — only the
// fields this adapter actually reads. See Meta's docs for the full shape.

export interface WebhookEnvelope {
  entry?: Array<{
    changes?: Array<{ value?: WebhookChangeValue }>;
  }>;
}

export interface WebhookChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<InboundMessage>;
  statuses?: Array<StatusUpdate>;
}

/** Media payloads all share this shape; only `document` carries a filename. */
export interface InboundMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

export interface InboundMessage {
  id: string;
  from: string; // sender's phone number, no leading '+'
  timestamp: string;
  type: "text" | "image" | "document" | "audio" | "video" | "sticker" | string;
  text?: { body: string };
  image?: InboundMedia;
  document?: InboundMedia;
  audio?: InboundMedia;
  video?: InboundMedia;
  sticker?: InboundMedia;
  /** Present when the client replied to one of our messages. */
  context?: { id?: string; from?: string };
}

export interface StatusUpdate {
  id: string; // wa_message_id this status refers to
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}
