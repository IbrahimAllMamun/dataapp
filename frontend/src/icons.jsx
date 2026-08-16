/**
 * Inline SVG icons. Stroke-based and `currentColor`-driven, so every icon
 * inherits the color and theme of whatever it sits inside.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/**
 * The IDLC mark: a solid red block with two brackets stepping off its
 * top-right corner.
 *
 * Unlike everything else in this file it is a FILLED mark, not a stroked
 * icon, so it deliberately does not take the shared `stroke` props. The red
 * is the brand's own and stays fixed in both themes; the brackets ride on
 * `currentColor` so they read black on a light tile and pale on a dark one,
 * instead of disappearing into it.
 *
 * The artwork is authored on a ~58 unit square — the viewBox has to match it,
 * or only its top-left corner is visible.
 */
export const BRAND_RED = "#ED1C24";

export function LogoMark(props) {
  return (
    <svg viewBox="0 0 58.32 58.37" aria-hidden="true" {...props}>
      <path fill={BRAND_RED} d="M 0 15.050781 L 43.21875 15.050781 L 43.21875 58.339844 L 0 58.339844 Z M 0 15.050781 " />
      <path fill="currentColor" d="M 50.75 7.507812 L 21.9375 7.507812 L 21.9375 11.3125 L 47.019531 11.3125 L 47.019531 36.433594 L 50.75 36.433594 Z M 50.75 7.507812 " />
      <path fill="currentColor" d="M 58.28125 0.0273438 L 36.671875 0.0273438 L 36.671875 3.769531 L 54.546875 3.769531 L 54.546875 21.609375 L 58.28125 21.609375 Z M 58.28125 0.0273438 " />
    </svg>
  );
}


export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" {...stroke} strokeWidth={2.2} {...props}>
      <path d="M2 6.2 4.6 9 10 3" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.2" />
    </svg>
  );
}

export function EmptyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </svg>
  );
}

export function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function FilterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <path d="M4 6.5h16M7 12h10M10 17.5h4" />
    </svg>
  );
}

export function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} {...props}>
      <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
    </svg>
  );
}
