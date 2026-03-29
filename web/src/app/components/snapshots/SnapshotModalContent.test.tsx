import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()
const mockFlowSnapshotsList = jest.fn()
const mockSnapshotsCreate = jest.fn()
const mockSnapshotsAddChain = jest.fn()
const mockSnapshotsUpdateChannel = jest.fn()
const mockSnapshotsActivate = jest.fn()
const mockGetDevices = jest.fn()

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

jest.mock('../../../map2/api', () => ({
  flowSnapshotsApi: {
    list: (...args: unknown[]) => mockFlowSnapshotsList(...args),
    get: jest.fn(),
    load: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
    setProgram: jest.fn(),
    reorder: jest.fn(),
  },
  pipewireApi: {
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
  },
}))

jest.mock('../../../map2/clients/snapshots', () => {
  const actual = jest.requireActual('../../../map2/clients/snapshots')
  return {
    ...actual,
    snapshotsApi: {
      ...actual.snapshotsApi,
      create: (...args: unknown[]) => mockSnapshotsCreate(...args),
      addChain: (...args: unknown[]) => mockSnapshotsAddChain(...args),
      updateChannel: (...args: unknown[]) => mockSnapshotsUpdateChannel(...args),
      activate: (...args: unknown[]) => mockSnapshotsActivate(...args),
    },
  }
})

jest.mock('./SnapshotImportDialog', () => ({
  SnapshotImportDialog: () => null,
}))

const { SnapshotModalContent } = require('./SnapshotModalContent') as typeof import('./SnapshotModalContent')

function formatDateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}${month}${day}`
}

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderContent(props: Partial<React.ComponentProps<typeof SnapshotModalContent>> = {}) {
  const queryClient = buildQueryClient()
  const applySnapshotData = jest.fn()
  const onRecall = jest.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <SnapshotModalContent
        entryPoint
        snapshotDraft={{
          flowSlots: [],
          routing: {
            mode: 'parallel_blend',
            activeSlotId: null,
            blendPositions: {},
            morphProgress: 0.5,
            morphSourceSlotId: null,
            morphTargetSlotId: null,
            seriesOrder: [],
          },
          activeFlowIndex: 0,
          chains: {},
        }}
        applySnapshotData={applySnapshotData}
        onRecall={onRecall}
        {...props}
      />
    </QueryClientProvider>,
  )

  return { applySnapshotData, onRecall }
}

describe('SnapshotModalContent', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
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
    })

    mockFlowSnapshotsList.mockResolvedValue({
      snapshots: [
        {
          id: 5,
          name: 'Existing Snapshot',
          description: '',
          tags: [],
          program_number: null,
          is_active: false,
          is_favorite: false,
          display_order: 0,
          flow_slots: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
        },
      ],
      count: 1,
      active_id: null,
    })
    mockGetDevices.mockResolvedValue({
      devices: [
        { id: 1, name: 'Input Alpha', nick: 'Input Alpha', driver: '', bus: '', media_class: 'Audio/Device', is_default: true, properties: {} },
        { id: 2, name: 'Output Beta', nick: 'Output Beta', driver: '', bus: '', media_class: 'Audio/Device', is_default: false, properties: {} },
      ],
    })
  })

  afterEach(() => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('shows the entry-point chooser and can switch to the library view', async () => {
    renderContent()

    expect(await screen.findByText('Choose a starting point')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load Existing' }))

    expect(await screen.findByText('Snapshots')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Create New' }).length).toBeGreaterThan(0)
  })

  it('creates, provisions, assigns, and activates a new snapshot from the wizard', async () => {
    const expectedChainName = `Fresh Snapshot-${formatDateStamp(new Date())}`
    mockSnapshotsCreate.mockResolvedValue({
      status: 'success',
      snapshot_id: 101,
      message: 'Created snapshot',
      snapshot: { id: 101 },
    })
    mockSnapshotsAddChain
      .mockResolvedValueOnce({
        id: 101,
        channels: [
          { id: 11, channel_key: 'ch_a' },
          { id: 12, channel_key: 'ch_b' },
        ],
        chains: [{ id: 201, name: expectedChainName }],
      })
      .mockResolvedValueOnce({
        id: 101,
        channels: [
          { id: 11, channel_key: 'ch_a' },
          { id: 12, channel_key: 'ch_b' },
        ],
        chains: [
          { id: 201, name: expectedChainName },
          { id: 202, name: expectedChainName },
        ],
      })
    mockSnapshotsUpdateChannel.mockResolvedValue({ id: 101 })
    mockSnapshotsActivate.mockResolvedValue({
      status: 'success',
      snapshot_id: 101,
      name: 'Fresh Snapshot',
      snapshot_data: {
        id: 101,
        name: 'Fresh Snapshot',
        description: '',
        tags: [],
        program_number: null,
        input_device: 'Input Alpha',
        output_device: 'Output Beta',
        is_active: true,
        is_favorite: false,
        display_order: 0,
        channels: [
          { id: 11, snapshot_id: 101, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, solo: false, dry_wet_mix: 100, order_index: 0, chain_id: 201 },
          { id: 12, snapshot_id: 101, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, solo: false, dry_wet_mix: 100, order_index: 1, chain_id: 202 },
        ],
        chains: [
          { id: 201, name: expectedChainName, plugins: [], loop_insertions: [], effects_loops: [] },
          { id: 202, name: expectedChainName, plugins: [], loop_insertions: [], effects_loops: [] },
        ],
        routing: {
          mode: 'series',
          active_channel_key: 'ch_a',
          blend_positions: { ch_a: 100, ch_b: 100 },
          morph_position: 0.5,
          morph_source_channel_key: 'ch_a',
          morph_target_channel_key: 'ch_b',
          series_order: ['ch_a', 'ch_b'],
        },
        midi_map: [],
        active_channel_index: 0,
        channel_count: 2,
        chain_count: 2,
        community_shared: false,
        community_download_count: 0,
        community_rating: null,
        community_rating_count: 0,
        deployments: [],
      },
      params_applied: 0,
      bypass_applied: 0,
    })

    const { applySnapshotData, onRecall } = renderContent()

    fireEvent.click(await screen.findByRole('button', { name: 'Create New' }))
    fireEvent.change(await screen.findByLabelText('Snapshot name'), { target: { value: 'Fresh Snapshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByLabelText('Series'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('Input device'), { target: { value: 'Input Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('Output device'), { target: { value: 'Output Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mockSnapshotsActivate).toHaveBeenCalledWith(101))

    expect(mockSnapshotsCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Fresh Snapshot',
      input_device: 'Input Alpha',
      output_device: 'Output Beta',
      routing: expect.objectContaining({
        mode: 'series',
        active_channel_key: 'ch_a',
      }),
    }))
    expect(mockSnapshotsAddChain).toHaveBeenNthCalledWith(1, 101, expectedChainName)
    expect(mockSnapshotsAddChain).toHaveBeenNthCalledWith(2, 101, expectedChainName)
    expect(mockSnapshotsUpdateChannel).toHaveBeenNthCalledWith(1, 101, 11, { chain_id: 201 })
    expect(mockSnapshotsUpdateChannel).toHaveBeenNthCalledWith(2, 101, 12, { chain_id: 202 })
    expect(mockSnapshotsCreate.mock.invocationCallOrder[0]).toBeLessThan(mockSnapshotsAddChain.mock.invocationCallOrder[0])
    expect(mockSnapshotsAddChain.mock.invocationCallOrder[1]).toBeLessThan(mockSnapshotsUpdateChannel.mock.invocationCallOrder[0])
    expect(mockSnapshotsUpdateChannel.mock.invocationCallOrder[1]).toBeLessThan(mockSnapshotsActivate.mock.invocationCallOrder[0])

    await waitFor(() => expect(applySnapshotData).toHaveBeenCalled())
    expect(onRecall).toHaveBeenCalled()
    expect(mockPushToast).not.toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error')
  })
})
