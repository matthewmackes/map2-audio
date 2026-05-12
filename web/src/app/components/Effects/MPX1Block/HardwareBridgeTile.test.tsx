import '@testing-library/jest-dom'

import React from 'react'
import { render, screen } from '@testing-library/react'

import { HardwareBridgeTile, HardwareBridgeSection } from './HardwareBridgeTile'

const mockUseAuto = jest.fn()
const mockUseInUse = jest.fn()
const mockSidePanel = jest.fn(() => null)

jest.mock('./useMpx1BlockApi', () => ({
  useAutoConnectionType: () => mockUseAuto(),
  useMpx1InUseByChain: () => mockUseInUse(),
}))

jest.mock('./MPX1BlockSidePanel', () => ({
  MPX1BlockSidePanel: (props: unknown) => mockSidePanel(props),
}))

const MPX1: any = {
  uri: 'hardware://lexicon-mpx1',
  name: 'Lexicon MPX-1',
  author: 'Lexicon / Harman',
  category: 'hardware-fx',
  is_hardware: true,
  singleton: true,
  connection_types: ['aes_ebu', 'spdif_coax'],
  preferred_connection: 'aes_ebu',
  requires_interface_capability: ['digital_io_stereo'],
  format_name: 'Hardware FX bridge',
}

describe('HardwareBridgeTile', () => {
  beforeEach(() => {
    mockUseAuto.mockReset()
    mockUseInUse.mockReset()
    mockSidePanel.mockReset()
  })

  it('renders unavailable + helper when no eligible interface is connected', () => {
    mockUseAuto.mockReturnValue({ preferred: null, aesCapable: [], spdifCapable: [] })
    mockUseInUse.mockReturnValue(null)
    render(
      <HardwareBridgeTile
        plugin={MPX1}
        currentChainId={null}
        snapshotEditingLocked={false}
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(screen.getByText(/No compatible interface connected/i)).toBeInTheDocument()
    const addBtn = screen.getByRole('button', { name: /Add to chain/i })
    expect(addBtn).toBeDisabled()
  })

  it('shows "already in use" affordance when MPX-1 belongs to another chain', () => {
    mockUseAuto.mockReturnValue({
      preferred: 'spdif_coax',
      aesCapable: [],
      spdifCapable: [{ interface_id: 'tascam.us-144mkii' }],
    })
    mockUseInUse.mockReturnValue('chain-A')
    render(
      <HardwareBridgeTile
        plugin={MPX1}
        currentChainId="chain-B"
        snapshotEditingLocked={false}
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(screen.getByText(/Already in use by chain chain-A/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add to chain/i })).toBeDisabled()
  })

  it('enables the Add button when an eligible interface is connected', () => {
    mockUseAuto.mockReturnValue({
      preferred: 'aes_ebu',
      aesCapable: [{ interface_id: 'someaes.interface' }],
      spdifCapable: [{ interface_id: 'tascam.us-144mkii' }],
    })
    mockUseInUse.mockReturnValue(null)
    render(
      <HardwareBridgeTile
        plugin={MPX1}
        currentChainId="chain-A"
        snapshotEditingLocked={false}
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Add to chain/i })).not.toBeDisabled()
    // Configure button appears when a chain is selected
    expect(screen.getByRole('button', { name: /Configure/i })).toBeInTheDocument()
    // Auto-preference tag is shown
    expect(screen.getByText(/Auto: aes_ebu/i)).toBeInTheDocument()
  })

  it('respects snapshotEditingLocked even with everything else available', () => {
    mockUseAuto.mockReturnValue({
      preferred: 'spdif_coax',
      aesCapable: [],
      spdifCapable: [{ interface_id: 'tascam.us-144mkii' }],
    })
    mockUseInUse.mockReturnValue(null)
    render(
      <HardwareBridgeTile
        plugin={MPX1}
        currentChainId="chain-A"
        snapshotEditingLocked
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Add to chain/i })).toBeDisabled()
  })
})

describe('HardwareBridgeSection', () => {
  beforeEach(() => {
    mockUseAuto.mockReset()
    mockUseInUse.mockReset()
    mockUseAuto.mockReturnValue({ preferred: null, aesCapable: [], spdifCapable: [] })
    mockUseInUse.mockReturnValue(null)
  })

  it('renders nothing when there are zero hardware plugins', () => {
    const { container } = render(
      <HardwareBridgeSection
        hardwarePlugins={[]}
        currentChainId={null}
        snapshotEditingLocked={false}
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one tile per hardware plugin', () => {
    render(
      <HardwareBridgeSection
        hardwarePlugins={[MPX1, { ...MPX1, uri: 'hardware://eventide-h8000', name: 'Eventide H8000' }]}
        currentChainId={null}
        snapshotEditingLocked={false}
        onAddPluginToCurrentChain={() => {}}
      />,
    )
    expect(screen.getByText('Lexicon MPX-1')).toBeInTheDocument()
    expect(screen.getByText('Eventide H8000')).toBeInTheDocument()
    expect(screen.getByText(/2 bridges/i)).toBeInTheDocument()
  })
})
