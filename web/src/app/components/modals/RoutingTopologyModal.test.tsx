import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RoutingTopologyModal } from './RoutingTopologyModal'

const mockGetCommands = jest.fn()

jest.mock('../../../map2/api', () => ({
  midiApiV2: {
    getCommands: (...args: unknown[]) => mockGetCommands(...args),
    createCommand: jest.fn(),
    updateCommand: jest.fn(),
    deleteCommand: jest.fn(),
  },
}))

jest.mock('../Controls/MidiCcBadge', () => ({
  MidiCcBadge: () => <span data-testid="midi-cc-badge" />,
}))

jest.mock('../SnapshotEditor/SnapshotEditorRoutingVisualizer', () => ({
  JuceGridRoutingVisualizer: () => <div data-testid="routing-visualizer" />,
}))

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderModal() {
  render(
    <QueryClientProvider client={buildQueryClient()}>
      <RoutingTopologyModal
        open
        onClose={jest.fn()}
        routingMode="parameter_morph"
        morphProgress={0.42}
        activeFlowIndex={0}
        flowSlots={[
          { id: 'flow-a', label: 'A', color: '#24a148', chainId: 101 },
          { id: 'flow-b', label: 'B', color: '#fa4d56', chainId: 102 },
        ]}
        routingVisualizerFlows={[
          { id: 'flow-a', label: 'A', color: '#24a148', active: true },
          { id: 'flow-b', label: 'B', color: '#fa4d56', active: false },
        ] as any}
        activeSlotId="flow-a"
        morphSourceSlotId="flow-a"
        morphTargetSlotId="flow-b"
        routingFocusButtons={[
          {
            id: 'flow-a',
            title: 'Flow A',
            caption: 'Primary live chain',
            active: true,
            color: '#24a148',
          },
          {
            id: 'flow-b',
            title: 'Flow B',
            caption: 'Secondary live chain',
            active: false,
            color: '#fa4d56',
          },
        ]}
        onSetRoutingMode={jest.fn()}
        onSelectFlowIndex={jest.fn()}
        onSetMorphProgress={jest.fn()}
        onOpenPortRouting={jest.fn()}
        onOpenAssignFlow={jest.fn()}
        activeFlowId="flow-a"
        liveStatusLabel="Live"
        liveStatusTagType="green"
        liveStatusMessage="Routing mode, morph, and branch focus edits apply immediately to the live snapshot."
      />
    </QueryClientProvider>,
  )
}

describe('RoutingTopologyModal', () => {
  beforeEach(() => {
    mockGetCommands.mockReset()
    mockGetCommands.mockResolvedValue({ commands: [] })

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }
  })

  it('renders flow-colored focus and morph context in the topology and live status strips', async () => {
    renderModal()

    await waitFor(() => {
      expect(mockGetCommands).toHaveBeenCalled()
    })

    expect(screen.getByText('Focus Flow A')).toBeInTheDocument()
    expect(screen.getByText('Morph 42%')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Routing mode, morph, and branch focus edits apply immediately to the live snapshot.')).toBeInTheDocument()

    const focusButton = screen.getByRole('button', { name: /flow a primary live chain/i })
    expect(focusButton).toHaveAttribute('style', expect.stringContaining('--rtm-flow-color: #24a148'))

    const sourceEndpoints = screen.getAllByText('A source')
    const targetEndpoints = screen.getAllByText('B target')

    expect(sourceEndpoints).toHaveLength(2)
    expect(targetEndpoints).toHaveLength(2)
    expect(sourceEndpoints[0]).toHaveAttribute('style', expect.stringContaining('--rtm-flow-color: #24a148'))
    expect(targetEndpoints[0]).toHaveAttribute('style', expect.stringContaining('--rtm-flow-color: #fa4d56'))
  })
})
