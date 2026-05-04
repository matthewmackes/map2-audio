/**
 * Custom MIDI-domain glyphs for MIDI Services section headers.
 *
 * Each glyph is a 24×24 SVG that uses `currentColor` for stroke and fill so
 * the parent's text/icon colour drives the rendering. Carbon icons cover
 * generic concepts (network, settings, monitor); this module covers the
 * domain-specific shapes that don't exist in Carbon.
 */

import type { SVGProps } from 'react'

type GlyphProps = SVGProps<SVGSVGElement>

function baseProps(extra?: GlyphProps): GlyphProps {
  return {
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    role: 'img',
    'aria-hidden': true,
    ...extra,
  }
}

/** 5-pin DIN connector. */
export function DinGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      {/* 5 pins on a 180° arc. */}
      <circle cx="6.4" cy="11" r="0.9" fill="currentColor" />
      <circle cx="8.5" cy="7" r="0.9" fill="currentColor" />
      <circle cx="12" cy="6" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="7" r="0.9" fill="currentColor" />
      <circle cx="17.6" cy="11" r="0.9" fill="currentColor" />
      {/* keyway notch */}
      <path d="M9.5 17.5 H14.5" />
    </svg>
  )
}

/** UMP — Universal MIDI Packet (MIDI 2.0). 32-bit packet stripes. */
export function UmpGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M7.5 6 V18" />
      <path d="M12 6 V18" />
      <path d="M16.5 6 V18" />
      <path d="M3 12 H21" strokeDasharray="2 2" />
    </svg>
  )
}

/** MPE — MIDI Polyphonic Expression. 3 expressive axes. */
export function MpeGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 18 Q9 6 12 12 T20 6" />
      <path d="M4 14 H20" strokeDasharray="2 2" />
      <circle cx="9" cy="11" r="1.2" fill="currentColor" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" />
    </svg>
  )
}

/** SysEx — F0 … F7 envelope. */
export function SysExGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 9 H20" />
      <path d="M4 15 H20" />
      <path d="M4 9 V15" />
      <path d="M20 9 V15" />
      <text
        x="12"
        y="14"
        textAnchor="middle"
        fontSize="6"
        fontFamily="ui-monospace, monospace"
        fill="currentColor"
        stroke="none"
      >
        F0…F7
      </text>
    </svg>
  )
}

/** MSC — MIDI Show Control. Cue list bullets. */
export function MscGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 7 H10" />
      <path d="M5 12 H10" />
      <path d="M5 17 H10" />
      <circle cx="14" cy="7" r="1.4" fill="currentColor" />
      <circle cx="14" cy="12" r="1.4" />
      <circle cx="14" cy="17" r="1.4" />
      <path d="M17 7 H20" />
      <path d="M17 12 H20" />
      <path d="M17 17 H20" />
    </svg>
  )
}

/** MTC — MIDI Time Code. SMPTE-style frame counter. */
export function MtcGlyph(props: GlyphProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fontSize="5.5"
        fontFamily="ui-monospace, monospace"
        fill="currentColor"
        stroke="none"
      >
        00:00
      </text>
    </svg>
  )
}
