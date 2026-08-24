/**
 * Line-art icon set matching WhatsApp's weight (1.7–2px strokes, rounded
 * caps, 24px grid). Inline SVG rather than an icon font so they inherit
 * currentColor and stay crisp at rail size.
 */

type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconChats = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.4-.6L3 21l1.8-4.9A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
  </svg>
);

export const IconStatus = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" strokeDasharray="4.2 3.1" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const IconClients = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

export const IconTeam = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8.5" r="3.1" />
    <path d="M3 19.5a6 6 0 0 1 12 0" />
    <path d="M16 5.6a3.1 3.1 0 0 1 0 5.9M17.2 14.4a6 6 0 0 1 3.8 5.1" />
  </svg>
);

export const IconDashboard = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.2" y="3.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.6" y="3.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="3.2" y="13.6" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.6" y="13.6" width="7.2" height="7.2" rx="1.6" />
  </svg>
);

export const IconTransfer = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8h13m0 0-3.4-3.4M17 8l-3.4 3.4" />
    <path d="M20 16H7m0 0 3.4-3.4M7 16l3.4 3.4" />
  </svg>
);

export const IconAudit = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7.5 3.5h9a1.6 1.6 0 0 1 1.6 1.6v13.8a1.6 1.6 0 0 1-1.6 1.6h-9a1.6 1.6 0 0 1-1.6-1.6V5.1a1.6 1.6 0 0 1 1.6-1.6Z" />
    <path d="M9.4 8.4h5.2M9.4 12h5.2M9.4 15.6h3" />
  </svg>
);

export const IconArchive = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.2" y="4.4" width="17.6" height="4" rx="1.2" />
    <path d="M5 8.4v9.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V8.4" />
    <path d="M10 12.2h4" />
  </svg>
);

export const IconSearch = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10.8" cy="10.8" r="6.6" />
    <path d="m15.6 15.6 4 4" />
  </svg>
);

export const IconNewChat = ({ size = 21, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6" />
    <path d="M12 9.2v6M9 12.2h6" />
  </svg>
);

export const IconMenu = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={2.4}>
    <circle cx="12" cy="5" r="0.6" />
    <circle cx="12" cy="12" r="0.6" />
    <circle cx="12" cy="19" r="0.6" />
  </svg>
);

export const IconVideo = ({ size = 21, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.8" y="6.2" width="12.6" height="11.6" rx="2.4" />
    <path d="m15.4 11 5.4-3.2v8.4L15.4 13Z" />
  </svg>
);

export const IconPhone = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6.2 3.6 8.6 3l2 4.4-2.1 1.6a11.5 11.5 0 0 0 5.5 5.5l1.6-2.1 4.4 2 -.6 2.4a2 2 0 0 1-2.2 1.5A16.4 16.4 0 0 1 4.7 5.8a2 2 0 0 1 1.5-2.2Z" />
  </svg>
);

export const IconPlus = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const IconEmoji = ({ size = 23, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M8.9 14.4a4 4 0 0 0 6.2 0" />
    <circle cx="9.2" cy="9.8" r="0.5" strokeWidth={2} />
    <circle cx="14.8" cy="9.8" r="0.5" strokeWidth={2} />
  </svg>
);

export const IconMic = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="9.2" y="3" width="5.6" height="10.4" rx="2.8" />
    <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8V21" />
  </svg>
);

export const IconSend = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 11.9 20.2 4 12.4 20.2l-1.7-6.6L4 11.9Z" />
  </svg>
);

export const IconAttach = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M18.5 11.4 12 17.9a4.1 4.1 0 0 1-5.8-5.8l7-7a2.8 2.8 0 0 1 3.9 3.9l-6.9 7a1.4 1.4 0 0 1-2-2l6.3-6.3" />
  </svg>
);

export const IconImage = ({ size = 21, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.4" />
    <circle cx="8.6" cy="9.6" r="1.5" />
    <path d="m4.2 17.2 4.8-4.6 4 3.6 3-2.6 4.6 4" />
  </svg>
);

export const IconDoc = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13.4 3.4H7.6A1.9 1.9 0 0 0 5.7 5.3v13.4a1.9 1.9 0 0 0 1.9 1.9h8.8a1.9 1.9 0 0 0 1.9-1.9V7.9Z" />
    <path d="M13.4 3.4v4.5h4.9" />
  </svg>
);

export const IconStop = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
  </svg>
);

export const IconPlug = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8.4 3.4v5M15.6 3.4v5" />
    <path d="M5.8 8.4h12.4v3.2a6.2 6.2 0 0 1-12.4 0z" />
    <path d="M12 17.8v3" />
  </svg>
);

export const IconEye = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12Z" />
    <circle cx="12" cy="12" r="3.1" />
  </svg>
);

export const IconShield = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.2 19 6v5.6c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V6z" />
    <path d="m9.2 12.1 2 2 3.6-4" />
  </svg>
);

export const IconChevron = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={2}>
    <path d="m7 10 5 5 5-5" />
  </svg>
);

export const IconReply = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 6 3.5 11.2 9 16.4" />
    <path d="M3.5 11.2h8.9a7.6 7.6 0 0 1 7.6 7.6v.6" />
  </svg>
);

export const IconForward = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m15 6 5.5 5.2L15 16.4" />
    <path d="M20.5 11.2h-8.9A7.6 7.6 0 0 0 4 18.8v.6" />
  </svg>
);

export const IconStar = ({ size = 19, className, filled }: P & { filled?: boolean }) => (
  <svg {...base(size)} className={className} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8z" />
  </svg>
);

export const IconPencil = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M16.4 3.9a2.2 2.2 0 0 1 3.1 3.1L8.2 18.3l-4.2 1.1 1.1-4.2z" />
  </svg>
);

export const IconTrash = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4.4 6.6h15.2M9.4 6.6V4.8h5.2v1.8" />
    <path d="M6.6 6.6l1 12.2a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5l1-12.2" />
  </svg>
);

export const IconPin = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3.6h6l-.8 5.2 3 3.2H6.8l3-3.2z" />
    <path d="M12 12v8.4" />
  </svg>
);

export const IconMuted = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 4l16 16" />
    <path d="M17.4 13.2V10a5.4 5.4 0 0 0-7.7-4.9M6.6 8.2V10c0 4-2 5.6-2 5.6h11" />
    <path d="M10.6 19.2a1.9 1.9 0 0 0 2.8 0" />
  </svg>
);

export const IconCopy = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2" />
    <path d="M15.6 8.4V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 2 2h2" />
  </svg>
);

export const IconInfo = ({ size = 19, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.2" />
    <circle cx="12" cy="8" r="0.6" strokeWidth={2} />
  </svg>
);

export const IconCheck = ({ double = false, size = 17 }: { double?: boolean; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.6 9.6 5.9 13l6.1-8" />
    {double && <path d="M7.4 12.6 8.9 14l6.2-8.2" />}
  </svg>
);
