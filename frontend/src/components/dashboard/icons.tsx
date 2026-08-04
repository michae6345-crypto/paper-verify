/**
 * The rail's marks, drawn here rather than pulled from an icon library, for the
 * reason `shell/nav-rail.tsx` gives: the product's own line weight, the same one
 * the verdict glyphs are drawn at, so the chrome and the marks read as one hand.
 *
 * 20x20 box, 1.5 stroke, round caps and joins, `currentColor` throughout. None
 * of them ever carries a verdict colour.
 */

type IconProps = { size?: number };

function Frame({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** Overview: the layout itself, a pane split from its header. */
export function OverviewIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="3" y="3.5" width="14" height="13" rx="2.5" />
      <path d="M3 8h14M9 8v8.5" />
    </Frame>
  );
}

/** Runs: rows arriving, each with its mark to the left. */
export function RunsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M8 5h9M8 10h9M8 15h6" />
      <circle cx="4.25" cy="5" r="1.35" />
      <circle cx="4.25" cy="10" r="1.35" />
      <circle cx="4.25" cy="15" r="1.35" />
    </Frame>
  );
}

/** Tests: the catalogue, grouped into sections. */
export function TestsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="3" y="3.5" width="6" height="6" rx="1.75" />
      <rect x="11" y="3.5" width="6" height="6" rx="1.75" />
      <rect x="3" y="11" width="6" height="5.5" rx="1.75" />
      <rect x="11" y="11" width="6" height="5.5" rx="1.75" />
    </Frame>
  );
}

/** Review: a finding held at the gate, flagged rather than published. */
export function ReviewIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M5 3v14" />
      <path d="M5 4.25h9.5l-2.25 3.25 2.25 3.25H5" />
    </Frame>
  );
}

/** Amendments: the finding and the contest, side by side, neither struck through. */
export function AmendmentsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="2.75" y="5" width="8" height="11" rx="2" />
      <path d="M13.5 5h1.75a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H13.5" />
    </Frame>
  );
}

export function AccountIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="10" cy="7" r="3.25" />
      <path d="M3.75 16.5c1.1-2.7 3.4-4.05 6.25-4.05s5.15 1.35 6.25 4.05" />
    </Frame>
  );
}

/** The rail's own control: keep it open, or let it collapse again. */
export function PinIcon({ open = false, size = 16 }: IconProps & { open?: boolean }) {
  return (
    <Frame size={size}>
      {open ? <path d="M11.5 5.5 7 10l4.5 4.5" /> : <path d="M8.5 5.5 13 10l-4.5 4.5" />}
      <path d="M15.5 4.5v11" />
    </Frame>
  );
}

export function CaretIcon({ size = 14 }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M6 8.25 10 12l4-3.75" />
    </Frame>
  );
}

export function TickIcon({ size = 14 }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4.5 10.5 8 14l7.5-8" />
    </Frame>
  );
}

export function ArrowIcon({ size = 14 }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4 10h11M11 6l4 4-4 4" />
    </Frame>
  );
}
