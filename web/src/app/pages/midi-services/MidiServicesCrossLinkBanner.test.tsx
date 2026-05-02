/**
 * T2482 loop 14 / iter 139 — MidiServicesCrossLinkBanner unit tests.
 *
 * Per the iter-131 plan D4: smoke tests only. Verifies:
 *   - banner renders with the default MIDI Services copy when only
 *     profileKey is provided
 *   - link target uses /midi/devices/{profileKey} with URI encoding
 *   - bespoke copy (the iter-138 Brain pattern) overrides the defaults
 *   - no profileKey + no linkTo defaults to /midi/devices index
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { MidiServicesCrossLinkBanner } from './MidiServicesCrossLinkBanner'

function withRouter(node: React.ReactElement) {
  return <MemoryRouter>{node}</MemoryRouter>
}

describe('MidiServicesCrossLinkBanner', () => {
  describe('default copy', () => {
    it('renders the default title + subtitle', () => {
      render(withRouter(<MidiServicesCrossLinkBanner profileKey="mackie/mcu.midi" />))
      expect(
        screen.getByText('Bound to the canonical MIDI Services authority'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/MIDI Services Bindings authority/i),
      ).toBeInTheDocument()
    })

    it('renders the default link label', () => {
      render(withRouter(<MidiServicesCrossLinkBanner profileKey="mackie/mcu.midi" />))
      expect(screen.getByRole('link')).toHaveTextContent(/Open in MIDI Services/i)
    })
  })

  describe('link targets', () => {
    it('links to /midi/devices/{profileKey} with URI encoding', () => {
      render(withRouter(<MidiServicesCrossLinkBanner profileKey="native-instruments/maschine-mk1.midi" />))
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute(
        'href',
        '/midi/devices/native-instruments%2Fmaschine-mk1.midi',
      )
    })

    it('falls back to /midi/devices index when profileKey is undefined and linkTo is unset', () => {
      render(withRouter(<MidiServicesCrossLinkBanner />))
      expect(screen.getByRole('link')).toHaveAttribute('href', '/midi/devices')
    })

    it('honors explicit linkTo override (Brain pattern)', () => {
      render(
        withRouter(
          <MidiServicesCrossLinkBanner
            linkTo="/midi/bindings?consumer_type=brain_slot"
            linkLabel="Open MIDI Services Bindings"
          />,
        ),
      )
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/midi/bindings?consumer_type=brain_slot')
      expect(link).toHaveTextContent(/Open MIDI Services Bindings/i)
    })
  })

  describe('bespoke copy override', () => {
    it('replaces title + subtitle when provided', () => {
      render(
        withRouter(
          <MidiServicesCrossLinkBanner
            title="Brain inputs are MIDI Services consumers"
            subtitle="Brain slots receive MIDI events through the canonical authority."
            linkTo="/midi/bindings?consumer_type=brain_slot"
          />,
        ),
      )
      expect(
        screen.getByText('Brain inputs are MIDI Services consumers'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Brain slots receive MIDI events through the canonical authority.'),
      ).toBeInTheDocument()
      // The default title should NOT appear.
      expect(
        screen.queryByText('Bound to the canonical MIDI Services authority'),
      ).not.toBeInTheDocument()
    })
  })
})
