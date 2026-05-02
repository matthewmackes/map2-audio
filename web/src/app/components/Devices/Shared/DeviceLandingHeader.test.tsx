/**
 * T2485-1 — DeviceLandingHeader unit tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { DeviceLandingHeader } from './DeviceLandingHeader'
import { validateDeviceManifest } from './deviceManifest'
import type { DeviceManifest } from './deviceManifest'

const MANIFEST: DeviceManifest = {
  profileKey: 'lexicon/mpx-1.midi',
  title: 'Lexicon MPX-1',
  purposeLines: [
    'Reverb and effects processor with 250 program slots.',
    'Two effect blocks per program covering REV/PIT/DLY/CHO/EQ/MOD.',
    'MIDI-controlled with full SysEx state recall.',
  ],
  views: [{ id: 'panel', label: 'Panel', landing: true }],
}

beforeAll(() => {
  validateDeviceManifest(MANIFEST)
})

describe('DeviceLandingHeader', () => {
  it('renders the manifest title', () => {
    render(<DeviceLandingHeader manifest={MANIFEST} />)
    expect(screen.getByRole('heading', { name: 'Lexicon MPX-1' })).toBeInTheDocument()
  })

  it('renders all three purpose lines', () => {
    render(<DeviceLandingHeader manifest={MANIFEST} />)
    expect(screen.getByText(/250 program slots/)).toBeInTheDocument()
    expect(screen.getByText(/REV\/PIT\/DLY\/CHO\/EQ\/MOD/)).toBeInTheDocument()
    expect(screen.getByText(/SysEx state recall/)).toBeInTheDocument()
  })

  it('exposes the profile key as a data attribute for diagnostics', () => {
    const { container } = render(<DeviceLandingHeader manifest={MANIFEST} />)
    const header = container.querySelector('.device-landing-header')
    expect(header).toHaveAttribute('data-profile-key', 'lexicon/mpx-1.midi')
  })

  it('labels the purpose list with the device title for screen readers', () => {
    render(<DeviceLandingHeader manifest={MANIFEST} />)
    expect(screen.getByLabelText('Lexicon MPX-1 purpose')).toBeInTheDocument()
  })
})
