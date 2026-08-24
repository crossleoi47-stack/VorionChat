/**
 * Vorion Systems wordmark, redrawn as inline SVG so it stays crisp at any
 * size and picks up the theme (the "SYSTEMS" line flips with dark mode,
 * the blue/gold letterforms stay brand-fixed).
 */
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 260 72"
      height={height}
      role="img"
      aria-label="Vorion Systems"
      style={{ display: "block" }}
    >
      <g
        fontFamily="'Poppins', 'Segoe UI', sans-serif"
        fontWeight="800"
        fontSize="46"
        letterSpacing="1"
      >
        <text x="0" y="40" fill="var(--brand-blue-ink)">
          V
        </text>
        <text x="36" y="40" fill="var(--brand-gold)">
          O
        </text>
        <text x="78" y="40" fill="var(--brand-blue-ink)">
          R
        </text>
        <text x="114" y="40" fill="var(--brand-blue-ink)">
          I
        </text>
        <text x="176" y="40" fill="var(--brand-blue-ink)">
          N
        </text>
      </g>

      {/* Gear "O" — the mark's focal point */}
      <g transform="translate(151, 25)">
        <GearTeeth />
        <circle r="15.5" fill="var(--brand-gold)" />
        <circle r="8.5" fill="var(--brand-ink-on-gold)" />
      </g>

      <text
        x="1"
        y="63"
        fontFamily="'Poppins', 'Segoe UI', sans-serif"
        fontWeight="600"
        fontSize="15"
        letterSpacing="7.5"
        fill="var(--logo-wordmark)"
      >
        SYSTEMS
      </text>
    </svg>
  );
}

function GearTeeth() {
  return (
    <g fill="var(--brand-gold)">
      {Array.from({ length: 10 }).map((_, i) => (
        <rect
          key={i}
          x="-2.6"
          y="-21"
          width="5.2"
          height="7"
          rx="1.4"
          transform={`rotate(${i * 36})`}
        />
      ))}
    </g>
  );
}

/** Compact square mark for tight spots (sidebar collapsed, favicons, avatars). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} role="img" aria-label="Vorion">
      {/* Solid tile, not ink — the true navy, with gold sitting on top of it. */}
      <rect width="44" height="44" rx="11" fill="var(--brand-blue)" />
      <g transform="translate(22, 22)">
        <g fill="var(--brand-gold)">
          {Array.from({ length: 10 }).map((_, i) => (
            <rect
              key={i}
              x="-1.9"
              y="-15.5"
              width="3.8"
              height="5.4"
              rx="1"
              transform={`rotate(${i * 36})`}
            />
          ))}
        </g>
        <circle r="11" fill="var(--brand-gold)" />
        {/* Knocked out of the gold disc, so it tracks the tile, not the theme. */}
        <circle r="5.6" fill="var(--brand-blue)" />
      </g>
    </svg>
  );
}
