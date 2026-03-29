import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnapshotChainManagementCard } from './SnapshotChainManagementCard'

const mockPushToast = jest.fn()

const mockChainsApi = {
  list: jest.fn(async () => ({
    chains: [
      {
        id: 101,
        name: 'Primary path',
        plugins: [
          {
            uri: 'urn:test:reverb',
            name: 'Reverb',
            position: 0,
            bypassed: false,
            plugin_display_type: 'Reverb',
          },
        ],
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ],
    active_chain_id: 101,
  })),
  create: jest.fn(),
  activate: jest.fn(),
  deactivate: jest.fn(),
  delete: jest.fn(),
}

jest.mock('../../../map2/api', () => ({
  chainsApi: mockChainsApi,
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SnapshotChainManagementCard
        selectedChainId={101}
        flowSlots={[
          {
            id: 'path-a',
            chainId: 101,
            label: 'A',
            color: '#4589ff',
          },
        ]}
        focusedFlowLabel="A"
        onToggleSelectedChainActive={jest.fn()}
        onDuplicateChain={jest.fn()}
        onRenameChain={jest.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('SnapshotChainManagementCard', () => {
  beforeEach(() => {
    mockChainsApi.list.mockClear()
    mockPushToast.mockClear()
  })

  it('uses snapshot-first path language while documenting runtime chain backing', async () => {
    renderCard()

    expect(await screen.findByText('Paths')).toBeInTheDocument()
    expect(screen.getByText('Each snapshot path becomes a runtime chain when it goes live or is activated.')).toBeInTheDocument()
    expect(screen.getByText('Live paths')).toBeInTheDocument()
    expect(screen.getByText('Selected path')).toBeInTheDocument()
    expect(screen.getByText('Path operations')).toBeInTheDocument()
    expect(screen.getByText('Path chooser')).toBeInTheDocument()
    expect(screen.getByText('Path A')).toBeInTheDocument()
    expect(screen.getByText('No path assigned')).toBeInTheDocument()
    expect(screen.getByText('Select a path from the chooser to the right to bind it to focused path A before duplicating, renaming, or changing activation.')).toBeInTheDocument()
  })
})
