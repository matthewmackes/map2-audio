/**
 * T2459-H5 Slice 20 — MidiLegacyRetirementBanner tests.
 *
 * Validates the four states the banner can be in:
 *   - hidden while the API call is in flight or errors
 *   - "deprecation window" countdown (info tone for >7 days)
 *   - "deprecation window" countdown (warning tone for ≤7 days)
 *   - "retired" post-flip warning
 *   - dismissible via Carbon's close button
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

const mockUseMidiLegacyRetirement = jest.fn()

jest.mock('./useMidiLegacyRetirement', () => ({
  __esModule: true,
  useMidiLegacyRetirement: () => mockUseMidiLegacyRetirement(),
}))

import { MidiLegacyRetirementBanner } from './MidiLegacyRetirementBanner'

beforeEach(() => {
  // Reset localStorage between tests so dismiss-state doesn't leak.
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
})

describe('MidiLegacyRetirementBanner — T2459-H5 Slice 20', () => {
  it('renders nothing while the API call is loading', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })
    const { container } = render(<MidiLegacyRetirementBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on API error', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })
    const { container } = render(<MidiLegacyRetirementBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an info-tone countdown during the deprecation window (>7 days)', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: {
        retired: false,
        sunset: 'Wed, 01 Jul 2026 00:00:00 GMT',
        sunset_iso: '2026-07-01T00:00:00+00:00',
        successor_prefix: '/api/v2/midi',
        now: '2026-05-05T15:00:00+00:00',
        days_remaining: 57,
        flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED',
      },
      isLoading: false,
      isError: false,
    })
    render(<MidiLegacyRetirementBanner />)
    const banner = screen.getByTestId('midi-legacy-retirement-banner')
    expect(banner).toHaveAttribute('data-state', 'deprecating')
    expect(banner).toHaveAttribute('data-days-remaining', '57')
    expect(banner).toHaveTextContent('MIDI v1 retirement scheduled')
    expect(banner).toHaveTextContent('57 days')
    expect(banner).toHaveTextContent('/api/v2/midi')
  })

  it('uses warning tone when ≤7 days remain', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: {
        retired: false,
        sunset: 'Wed, 01 Jul 2026 00:00:00 GMT',
        sunset_iso: '2026-07-01T00:00:00+00:00',
        successor_prefix: '/api/v2/midi',
        now: '2026-06-28T15:00:00+00:00',
        days_remaining: 3,
        flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED',
      },
      isLoading: false,
      isError: false,
    })
    render(<MidiLegacyRetirementBanner />)
    const banner = screen.getByTestId('midi-legacy-retirement-banner')
    expect(banner).toHaveAttribute('data-days-remaining', '3')
    expect(banner).toHaveTextContent('3 days')
  })

  it('renders the "overdue" subtitle when days_remaining is 0', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: {
        retired: false,
        sunset: 'Wed, 01 Jul 2026 00:00:00 GMT',
        sunset_iso: '2026-07-01T00:00:00+00:00',
        successor_prefix: '/api/v2/midi',
        now: '2026-07-02T00:00:00+00:00',
        days_remaining: 0,
        flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED',
      },
      isLoading: false,
      isError: false,
    })
    render(<MidiLegacyRetirementBanner />)
    const banner = screen.getByTestId('midi-legacy-retirement-banner')
    expect(banner).toHaveTextContent('overdue')
  })

  it('renders a retired-state notification after the flag flips', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: {
        retired: true,
        sunset: 'Wed, 01 Jul 2026 00:00:00 GMT',
        sunset_iso: '2026-07-01T00:00:00+00:00',
        successor_prefix: '/api/v2/midi',
        now: '2026-08-15T00:00:00+00:00',
        days_remaining: null,
        flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED',
      },
      isLoading: false,
      isError: false,
    })
    render(<MidiLegacyRetirementBanner />)
    const banner = screen.getByTestId('midi-legacy-retirement-banner')
    expect(banner).toHaveAttribute('data-state', 'retired')
    expect(banner).toHaveTextContent('MIDI v1 routes retired')
    expect(banner).toHaveTextContent('410 Gone')
  })

  it('hides the banner after the operator clicks close', () => {
    mockUseMidiLegacyRetirement.mockReturnValue({
      data: {
        retired: false,
        sunset: 'Wed, 01 Jul 2026 00:00:00 GMT',
        sunset_iso: '2026-07-01T00:00:00+00:00',
        successor_prefix: '/api/v2/midi',
        now: '2026-05-05T15:00:00+00:00',
        days_remaining: 57,
        flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED',
      },
      isLoading: false,
      isError: false,
    })
    const { rerender } = render(<MidiLegacyRetirementBanner />)
    const closeBtn = screen
      .getByTestId('midi-legacy-retirement-banner')
      .querySelector('button[aria-label="close notification"]') as HTMLElement
    expect(closeBtn).toBeInTheDocument()
    fireEvent.click(closeBtn)
    rerender(<MidiLegacyRetirementBanner />)
    expect(
      screen.queryByTestId('midi-legacy-retirement-banner'),
    ).not.toBeInTheDocument()
  })
})
