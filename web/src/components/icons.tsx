// Inline SVG icons.
//
// The landing page used emoji as its illustration layer, which renders
// differently on every platform and reads as a placeholder. These are drawn on
// a shared 24-unit grid with a 1.6 stroke so they sit together as a set, and
// they inherit `currentColor` so a tile can tint them.

type IconProps = { className?: string };

function Svg({
  children,
  className = "h-5 w-5",
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Speed — a lightning bolt. */
export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </Svg>
  );
}

/** Cost — a coin with a downward arrow. */
export function CoinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10.2c0-1.2 1.1-2 2.5-2s2.5.6 2.5 1.8-1.1 1.6-2.5 1.9-2.5.7-2.5 1.9 1.1 1.8 2.5 1.8 2.5-.8 2.5-2" />
    </Svg>
  );
}

/** Savings — a vault door. */
export function VaultIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8.6v1.2M12 14.2v1.2M8.6 12h1.2M14.2 12h1.2M6 20v1.5M18 20v1.5" />
    </Svg>
  );
}

/** Sending — a paper plane. */
export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />
    </Svg>
  );
}

/** Receiving — an arrow into a tray. */
export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v9m0 0 3.2-3.2M12 12 8.8 8.8" />
      <path d="M3.5 14.5h4l1.2 2.5h6.6l1.2-2.5h4v3.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3v-3.2Z" />
    </Svg>
  );
}

/** A rule or setting — sliders. */
export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21v-7M5 10V3M12 21v-11M12 6V3M19 21v-4M19 13V3" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="19" cy="15" r="2" />
    </Svg>
  );
}

/** Verification — a shield with a tick. */
export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.8 4.5 6v6c0 4.4 3.1 8.2 7.5 9.3 4.4-1.1 7.5-4.9 7.5-9.3V6L12 2.8Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </Svg>
  );
}

/** Growth — an upward trend line. */
export function TrendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17.5 9 11l4 4 8-8.5" />
      <path d="M16 6.5h5v5" />
    </Svg>
  );
}

/** External link. */
export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Svg>
  );
}
