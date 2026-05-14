import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'

import { MaschineQuadMorphZone } from './MaschineQuadMorphZone'
import type { MaschineHidEvent } from '../../../map2/types'

// T2522-C cycle 8 — Quad Morph zone unit tests.
//
// Mock both the State Authority API client and the underlying
// MorphPad component. We're not asserting morph engine I/O here —
// those tests live next to the MorphPad. The zone-specific
// contract is: corner labels resolve from the morph state, encoder
// HID events flash the matching corner row, and the help copy
// names the cycle-11 follow-up.

jest.mock('../../../map2/clients/stateAuthority', () => ({
  __esModule: true,
  stateAuthorityApi: {
    getMorphState: jest.fn(async () => ({
      x: 0.5,
      y: 0.5,
      configured_corners: [
        { corner: 'A', snapshot_name: 'Clean Tone' },
        { corner: 'B', snapshot_name: 'Lead Crunch' },
        { corner: 'C', snapshot_name: 'Ambient Wash' },
        { corner: 'D', snapshot_name: 'Heavy Doom' },
      ],
    })),
  },
}))

// Replace the MorphPad with a stub so we don't pull in its own
// network / drag side-effects. The zone test only cares about its
// own legend + corner-row behavior.
jest.mock('../StateAuthority/MorphPad', () => ({
  __esModule: true,
  MorphPad: () => <div data-testid="morph-pad-stub">[MorphPad]</div>,
}))

describe('MaschineQuadMorphZone', () => {
  it('mounts the MorphPad stub and the corner legend with snapshot names', async () => {
    render(<MaschineQuadMorphZone hidEvents={[]} />)
    expect(screen.getByTestId('morph-pad-stub')).toBeInTheDocument()
    expect(await screen.findByText('Clean Tone')).toBeInTheDocument()
    expect(screen.getByText('Lead Crunch')).toBeInTheDocument()
    expect(screen.getByText('Ambient Wash')).toBeInTheDocument()
    expect(screen.getByText('Heavy Doom')).toBeInTheDocument()
  })

  it('flashes the matching corner row when an encoder HID event arrives', async () => {
    const events: MaschineHidEvent[] = [
      {
        timestamp: '2026-05-14T17:00:00.000Z',
        direction: 'in',
        decoded_type: 'encoder',
        raw_hex: 'AA',
        // Encoder index 1 → corner B.
        payload: { encoder: 1, delta: 1 },
      },
    ]
    const { container } = render(<MaschineQuadMorphZone hidEvents={events} />)
    await waitFor(() => {
      const active = container.querySelectorAll('.maschine-morph__corner-row--active')
      expect(active.length).toBe(1)
      expect(active[0].textContent).toContain('B')
    })
  })

  it('renders the cycle-11 hint about encoder→morph wiring', async () => {
    render(<MaschineQuadMorphZone hidEvents={[]} />)
    expect(await screen.findByText(/cycle 11/i)).toBeInTheDocument()
  })
})
