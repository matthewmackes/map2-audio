import React from 'react'

interface BiampIconProps {
  size?: number
  color?: string
}

/** Inline SVG Biamp "b" letterform logo — same pattern as DragonIcon in AppShell.tsx. */
export function BiampIcon({ size = 16, color = '#E31837' }: BiampIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Biamp"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Vertical stem */}
      <rect x="5" y="3" width="3" height="18" rx="1.5" fill={color} />
      {/* Lower bowl */}
      <path
        d="M8 10 C8 10 18 10 18 14.5 C18 19 8 19 8 19"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
