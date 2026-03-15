import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockChainsApi = {
  list: jest.fn(async () => ({
    chains: [
      { id: 1, name: 'Alpha Chain', plugins: [], is_active: true },
      { id: 2, name: 'Beta Chain', plugins: [], is_active: false },
    ],
    active_chain_id: 1,
  })),
  create: jest.fn(async () => ({ id: 3, name: 'Gamma Chain', plugins: [], is_active: false })),
  activate: jest.fn(async () => ({})),
  deactivate: jest.fn(async () => ({})),
  delete: jest.fn(async () => ({})),
}

const mockPushToast = jest.fn()

jest.mock('../../map2/api', () => ({
  chainsApi: mockChainsApi,
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

const { JuceGridChainManagementCard } = require('./JuceGridChainManagementCard') as typeof import('./JuceGridChainManagementCard')

describe('JuceGridChainManagementCard', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
    Object.values(mockChainsApi).forEach((mockFn) => {
      if (typeof mockFn === 'function' && 'mockReset' in mockFn) {
        ;(mockFn as jest.Mock).mockReset()
      }
    })
    mockChainsApi.list.mockResolvedValue({
      chains: [
        { id: 1, name: 'Alpha Chain', plugins: [], is_active: true },
        { id: 2, name: 'Beta Chain', plugins: [], is_active: false },
      ],
      active_chain_id: 1,
    })
    mockChainsApi.create.mockResolvedValue({ id: 3, name: 'Gamma Chain', plugins: [], is_active: false })
    mockChainsApi.activate.mockResolvedValue({})
    mockChainsApi.deactivate.mockResolvedValue({})
    mockChainsApi.delete.mockResolvedValue({})
  })

  it('places the new chain button inside chain operations instead of the header action strip', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <JuceGridChainManagementCard
          selectedChainId={1}
          flowSlots={[
            { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe' },
          ]}
          focusedFlowLabel="A"
          onChainSelect={jest.fn()}
          onSelectedChainRemoved={jest.fn()}
          onToggleSelectedChainActive={jest.fn()}
          onSavePreset={jest.fn()}
          onLoadPreset={jest.fn()}
          onImportPreset={jest.fn()}
          onDuplicateChain={jest.fn()}
          onRenameChain={jest.fn()}
        />
      </QueryClientProvider>,
    )

    await screen.findByRole('list', { name: 'Available chains' })

    const operationsTile = screen.getByText('Chain operations').closest('.juce-grid-page__chain-action-tile')
    expect(operationsTile).toBeTruthy()
    expect(within(operationsTile as HTMLElement).getByRole('button', { name: 'New chain' })).toBeTruthy()

    const headerActions = container.querySelector('.juce-grid-page__chain-card-header-actions')
    expect(headerActions).toBeTruthy()
    expect(within(headerActions as HTMLElement).queryByRole('button', { name: 'New chain' })).toBeNull()
  })
})
