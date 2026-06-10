import React from "react";

/*
 * Shared output-type icons, per docs/specs/21-orientation-icons.md.
 * Inline SVGs on currentColor, sized to ride alongside 11 to 12px mono
 * labels. Covers all five output types, including data.
 */
const base = {
  width: 12,
  height: 12,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const OUTPUT_TYPE_ICONS = {
  text: (
    <svg {...base}>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  ),
  fields: (
    <svg {...base}>
      <rect x="2.5" y="3" width="11" height="4" rx="1" />
      <rect x="2.5" y="9" width="11" height="4" rx="1" />
    </svg>
  ),
  file: (
    <svg {...base}>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  ),
  link: (
    <svg {...base}>
      <path d="M6.5 9.5l3-3" />
      <path d="M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1" />
      <path d="M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />
    </svg>
  ),
  data: (
    <svg {...base}>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
      <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </svg>
  ),
};

/** Inline icon for an output type; renders nothing for unknown types (fail soft). */
export function OutputTypeIcon({ type }) {
  const icon = OUTPUT_TYPE_ICONS[type];
  if (!icon) return null;
  return <span className="pf-oticon">{icon}</span>;
}
