import React from 'react'
import { render } from '@testing-library/react'

import { SegmentedLedText } from './SegmentedLedText'

describe('SegmentedLedText', () => {
  it('renders segmented numeric fragments while preserving the readable string', () => {
    const { container } = render(<SegmentedLedText value="100% blend" />)

    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('100% blend')
    expect(container.querySelectorAll('.segmented-led__digit')).toHaveLength(3)
    expect(container.querySelector('.segmented-led__glyph--percent')).toBeTruthy()
  })

  it('supports negative, decimal, clock, slash, and leading-zero formats', () => {
    const { container } = render(<SegmentedLedText value="-00:12.5 / 48K / 256 ms" />)

    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('-00:12.5 / 48K / 256 ms')
    expect(container.querySelectorAll('.segmented-led__glyph--colon')).toHaveLength(1)
    expect(container.querySelectorAll('.segmented-led__glyph--slash').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('.segmented-led__glyph--dot')).toBeTruthy()
  })
})
