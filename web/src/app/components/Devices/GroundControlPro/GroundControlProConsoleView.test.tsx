/**
 * T2488 — GroundControlProConsoleView smoke test.
 * Mocks the heavy GroundControlProPage so we test only the
 * unified-shell entry point's shape (manifest header + body slot).
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { GroundControlProConsoleView } from './GroundControlProConsoleView'

jest.mock('../../../pages/GroundControlProPage', () => ({
  GroundControlProPage: () => <div data-testid="gcp-page-body">gcp body</div>,
}))

describe('GroundControlProConsoleView', () => {
  it('renders the manifest title from DeviceLandingHeader', () => {
    render(<GroundControlProConsoleView />)
    expect(
      screen.getByRole('heading', { name: 'Voodoo Lab Ground Control Pro' }),
    ).toBeInTheDocument()
  })

  it('renders all 3 purpose lines', () => {
    render(<GroundControlProConsoleView />)
    expect(screen.getByText(/ten-button MIDI foot controller/i)).toBeInTheDocument()
    expect(screen.getByText(/Live-rig SysEx authoring/i)).toBeInTheDocument()
    expect(screen.getByText(/tuner mute/i)).toBeInTheDocument()
  })

  it('renders the integrated GroundControlProPage body', () => {
    render(<GroundControlProConsoleView />)
    expect(screen.getByTestId('gcp-page-body')).toBeInTheDocument()
  })
})
