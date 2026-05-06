import type { CSSProperties } from 'react'

import './SegmentedLedText.css'

const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const

type SegmentName = typeof SEGMENT_NAMES[number]

export type SegmentedLedTextSize = 'xs' | 'sm' | 'md'

interface SegmentedLedTextProps {
  value: string | number
  size?: SegmentedLedTextSize
  color?: string
  className?: string
}

const DIGIT_SEGMENTS: Record<string, SegmentName[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
}

function renderSevenSegmentGlyph(char: string, key: string) {
  const activeSegments = new Set(
    char === '-'
      ? ['g']
      : char === '+'
        ? ['g']
        : DIGIT_SEGMENTS[char] ?? [],
  )
  const isPlus = char === '+'

  return (
    <span
      key={key}
      className={`segmented-led__digit ${isPlus ? 'segmented-led__digit--plus' : ''}`}
    >
      {char}
      {SEGMENT_NAMES.map((segment) => (
        <span
          key={segment}
          className={`segmented-led__segment segmented-led__segment--${segment} ${activeSegments.has(segment) ? 'is-on' : ''}`}
        />
      ))}
      {isPlus && <span className="segmented-led__plus-vertical" />}
    </span>
  )
}

function renderGlyph(char: string, key: string) {
  if (char === ' ') {
    return <span key={key} className="segmented-led__space">{char}</span>
  }

  if (char in DIGIT_SEGMENTS || char === '-' || char === '+') {
    return renderSevenSegmentGlyph(char, key)
  }

  if (char === '.') {
    return (
      <span key={key} className="segmented-led__glyph segmented-led__glyph--dot">
        {char}
        <span className="segmented-led__dot segmented-led__dot--single" />
      </span>
    )
  }

  if (char === ':') {
    return (
      <span key={key} className="segmented-led__glyph segmented-led__glyph--colon">
        {char}
        <span className="segmented-led__dot segmented-led__dot--top" />
        <span className="segmented-led__dot segmented-led__dot--bottom" />
      </span>
    )
  }

  if (char === '/') {
    return (
      <span key={key} className="segmented-led__glyph segmented-led__glyph--slash">
        {char}
        <span className="segmented-led__slash" />
      </span>
    )
  }

  if (char === '%') {
    return (
      <span key={key} className="segmented-led__glyph segmented-led__glyph--percent">
        {char}
        <span className="segmented-led__dot segmented-led__dot--top" />
        <span className="segmented-led__slash" />
        <span className="segmented-led__dot segmented-led__dot--bottom" />
      </span>
    )
  }

  return <span key={key} className="segmented-led__text">{char}</span>
}

export function SegmentedLedText({
  value,
  size = 'sm',
  color = '#59a8ff',
  className = '',
}: SegmentedLedTextProps) {
  const text = String(value)

  return (
    <span
      className={['segmented-led', `segmented-led--${size}`, className].filter(Boolean).join(' ')}
      style={{ '--seg-led-color': color } as CSSProperties}
      aria-label={text}
    >
      {/* Audit Anti-5 (cycle 37): kept the index+char composite key
          intentionally. `renderGlyph` dispatches to structurally-different
          spans depending on `char` (digit → 7 segment children, colon →
          2 dot children, percent → 3 children, plain text → none). Using
          index-only keys would force React to reconcile heterogeneous
          children inside one position when the char class changes (e.g.
          "1" → ":"), which is messier than letting the position remount.
          For monotonic numeric updates ("P12" → "P22") only the changed
          position remounts; positions 0 and 2 reuse cleanly. */}
      {Array.from(text).map((char, index) => renderGlyph(char, `${index}-${char}`))}
    </span>
  )
}

export default SegmentedLedText
