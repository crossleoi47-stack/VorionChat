// Deterministic per-person colour so the same contact always looks the same
// across sessions. Hues sit in the brand's blue→teal→violet arc plus the gold,
// so the roster reads as one palette rather than a random rainbow.
const PALETTE = [
  "#12379b",
  "#1f6fb2",
  "#0f766e",
  "#5b3fa8",
  "#b26a00",
  "#9b1c5e",
  "#2b6a3f",
  "#3f51b5",
];

function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  seed,
  size = "md",
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
}) {
  const color = PALETTE[hashCode(seed ?? name) % PALETTE.length];
  const cls = size === "md" ? "avatar" : `avatar ${size}`;
  return (
    <div className={cls} style={{ background: color }} aria-hidden="true">
      {initialsOf(name)}
    </div>
  );
}
