import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()
const mockSnapshotsList = jest.fn()
const mockSnapshotsCreate = jest.fn()
const mockSnapshotsActivate = jest.fn()
const mockGetDevices = jest.fn()
const mockUpdateSpecialSettings = jest.fn()
let mockSpecialSettings = {
  enabled: false,
  hiddenPlugins: [],
  menuLocation: 'hidden' as const,
  pinnedRoutes: [],
  landingTiles: [],
  snapshotSetlistMode: false,
  snapshotSetlistOrder: [] as number[],
  lastActiveNode: null,
}

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

jest.mock('../../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: mockSpecialSettings,
    isLoading: false,
    error: null,
    updateSettings: (...args: unknown[]) => mockUpdateSpecialSettings(...args),
    reload: jest.fn(),
  }),
}))

jest.mock('../../../map2/api', () => ({
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
      list: (...args: unknown[]) => mockSnapshotsList(...args),
      create: (...args: unknown[]) => mockSnapshotsCreate(...args),
      activate: (...args: unknown[]) => mockSnapshotsActivate(...args),
    },
  }
})

jest.mock('./SnapshotImportDialog', () => ({
  SnapshotImportDialog: () => null,
}))

const { SnapshotModalContent } = require('./SnapshotModalContent') as typeof import('./SnapshotModalContent')

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

  return { applySnapshotData, onRecall, queryClient }
}

describe('SnapshotModalContent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateSpecialSettings.mockResolvedValue(undefined)
    mockSpecialSettings = {
      enabled: false,
      hiddenPlugins: [],
      menuLocation: 'hidden',
      pinnedRoutes: [],
      landingTiles: [],
      snapshotSetlistMode: false,
      snapshotSetlistOrder: [],
      lastActiveNode: null,
    }

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

    mockSnapshotsList.mockResolvedValue({
      snapshots: [
        {
          id: 5,
          name: 'Existing Snapshot',
          description: '',
          tags: [],
          program_number: null,
          input_device: null,
          output_device: null,
          is_active: false,
          is_favorite: false,
          display_order: 0,
          channels: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
          channel_count: 0,
          chain_count: 0,
          community_shared: false,
          community_download_count: 0,
          community_rating: null,
          community_rating_count: 0,
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

  it('creates and activates a new snapshot from the wizard using snapshot paths', async () => {
    mockSnapshotsCreate.mockResolvedValue({
      status: 'success',
      snapshot_id: 101,
      message: 'Created snapshot',
      snapshot: { id: 101 },
    })
    mockSnapshotsActivate.mockResolvedValue({
      status: 'success',
      snapshot_id: 101,
      name: 'FreshSnapshot',
      snapshot_data: {
        id: 101,
        name: 'FreshSnapshot',
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
          { id: 201, name: 'FreshSnapshot Path A', plugins: [], loop_insertions: [], effects_loops: [] },
          { id: 202, name: 'FreshSnapshot Path B', plugins: [], loop_insertions: [], effects_loops: [] },
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
        paths: [
          {
            id: 'ch_a',
            name: 'FreshSnapshot Path A',
            label: 'A',
            color: '#2563eb',
            muted: false,
            solo: false,
            dry_wet_mix: 100,
            order_index: 0,
            snapshot_chain_id: 201,
            runtime_chain_id: 301,
            plugins: [],
            loop_insertions: [],
            effects_loops: [],
          },
          {
            id: 'ch_b',
            name: 'FreshSnapshot Path B',
            label: 'B',
            color: '#22c55e',
            muted: false,
            solo: false,
            dry_wet_mix: 100,
            order_index: 1,
            snapshot_chain_id: 202,
            runtime_chain_id: 302,
            plugins: [],
            loop_insertions: [],
            effects_loops: [],
          },
        ],
        io_bindings: {
          input_device: 'Input Alpha',
          output_device: 'Output Beta',
          remap_required: false,
        },
        controls: {
          midi_map: [],
          automation_lanes: [],
          expression_mappings: [],
        },
        assets: [],
        live_state: {
          is_live: true,
          activated_at: '2026-03-29T12:00:00Z',
          paths: [
            { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 301 },
            { path_id: 'ch_b', snapshot_chain_id: 202, runtime_chain_id: 302 },
          ],
          runtime_chains: [
            {
              id: 301,
              name: 'FreshSnapshot Path A (A)',
              is_active: true,
              created_at: '2026-03-29T12:00:00Z',
              updated_at: '2026-03-29T12:00:00Z',
              plugins: [],
              loop_insertions: [],
              effects_loops: [],
              runtime_sync: null,
            },
            {
              id: 302,
              name: 'FreshSnapshot Path B (B)',
              is_active: true,
              created_at: '2026-03-29T12:00:00Z',
              updated_at: '2026-03-29T12:00:00Z',
              plugins: [],
              loop_insertions: [],
              effects_loops: [],
              runtime_sync: null,
            },
          ],
        },
        lineage: {
          derived_from_snapshot_id: null,
        },
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

    const { applySnapshotData, onRecall, queryClient } = renderContent()

    fireEvent.click(await screen.findByRole('button', { name: 'Create New' }))
    fireEvent.change(await screen.findByLabelText('Snapshot name'), { target: { value: 'FreshSnapshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByLabelText('Series'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('Input device'), { target: { value: 'Input Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('Output device'), { target: { value: 'Output Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mockSnapshotsActivate).toHaveBeenCalledWith(101))

    expect(mockSnapshotsCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'FreshSnapshot',
      io_bindings: expect.objectContaining({
        input_device: 'Input Alpha',
        output_device: 'Output Beta',
      }),
      paths: [
        expect.objectContaining({
          id: 'ch_a',
          label: 'A',
          snapshot_chain_id: 1,
        }),
        expect.objectContaining({
          id: 'ch_b',
          label: 'B',
          snapshot_chain_id: 2,
        }),
      ],
      chains: [
        expect.objectContaining({
          id: 1,
          name: 'FreshSnapshot Path A',
        }),
        expect.objectContaining({
          id: 2,
          name: 'FreshSnapshot Path B',
        }),
      ],
      routing: expect.objectContaining({
        mode: 'series',
        active_channel_key: 'ch_a',
      }),
    }))
    expect(mockSnapshotsCreate.mock.invocationCallOrder[0]).toBeLessThan(mockSnapshotsActivate.mock.invocationCallOrder[0])

    await waitFor(() => expect(applySnapshotData).toHaveBeenCalled())
    expect(applySnapshotData).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        toastMessage: 'Snapshot created',
        invalidateChains: false,
      }),
    )
    expect(onRecall).toHaveBeenCalled()
    expect(queryClient.getQueryData(['snapshots', 'live'])).toEqual(
      expect.objectContaining({
        id: 101,
        name: 'FreshSnapshot',
      }),
    )
    expect(queryClient.getQueryData(['chains'])).toEqual(
      expect.objectContaining({
        count: 2,
        chains: expect.arrayContaining([
          expect.objectContaining({ id: 301, name: 'FreshSnapshot Path A (A)' }),
          expect.objectContaining({ id: 302, name: 'FreshSnapshot Path B (B)' }),
        ]),
      }),
    )
    expect(mockPushToast).not.toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error')
  })

  it('recalls an existing snapshot without invalidating freshly injected chains', async () => {
    mockSnapshotsActivate.mockResolvedValue({
      status: 'success',
      snapshot_id: 5,
      name: 'Existing Snapshot',
      snapshot_data: {
        id: 5,
        name: 'Existing Snapshot',
        description: '',
        tags: [],
        program_number: 12,
        input_device: 'Input Alpha',
        output_device: 'Output Beta',
        is_active: true,
        is_favorite: true,
        display_order: 0,
        channels: [
          { id: 21, snapshot_id: 5, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, solo: false, dry_wet_mix: 100, order_index: 0, chain_id: 401 },
        ],
        chains: [
          { id: 401, name: 'Existing Snapshot Path A', plugins: [], loop_insertions: [], effects_loops: [] },
        ],
        routing: {
          mode: 'parallel_blend',
          active_channel_key: 'ch_a',
          blend_positions: { ch_a: 100 },
          morph_position: 0.5,
          morph_source_channel_key: 'ch_a',
          morph_target_channel_key: 'ch_a',
          series_order: ['ch_a'],
        },
        midi_map: [],
        paths: [
          {
            id: 'ch_a',
            name: 'Existing Snapshot Path A',
            label: 'A',
            color: '#2563eb',
            muted: false,
            solo: false,
            dry_wet_mix: 100,
            order_index: 0,
            snapshot_chain_id: 401,
            runtime_chain_id: 501,
            plugins: [],
            loop_insertions: [],
            effects_loops: [],
          },
        ],
        io_bindings: {
          input_device: 'Input Alpha',
          output_device: 'Output Beta',
          remap_required: false,
        },
        controls: {
          midi_map: [],
          automation_lanes: [],
          expression_mappings: [],
        },
        assets: [],
        live_state: {
          is_live: true,
          activated_at: '2026-03-29T12:00:00Z',
          paths: [
            { path_id: 'ch_a', snapshot_chain_id: 401, runtime_chain_id: 501 },
          ],
          runtime_chains: [
            {
              id: 501,
              name: 'Existing Snapshot Path A (A)',
              is_active: true,
              created_at: '2026-03-29T12:00:00Z',
              updated_at: '2026-03-29T12:00:00Z',
              plugins: [],
              loop_insertions: [],
              effects_loops: [],
              runtime_sync: null,
            },
          ],
        },
        lineage: {
          derived_from_snapshot_id: null,
        },
        active_channel_index: 0,
        channel_count: 1,
        chain_count: 1,
        community_shared: false,
        community_download_count: 0,
        community_rating: null,
        community_rating_count: 0,
        deployments: [],
      },
      params_applied: 0,
      bypass_applied: 0,
    })

    const { applySnapshotData, onRecall, queryClient } = renderContent()

    fireEvent.click(await screen.findByRole('button', { name: 'Load Existing' }))
    fireEvent.click(await screen.findByRole('button', { name: /Snapshot Library/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Recall' }))

    await waitFor(() => expect(mockSnapshotsActivate).toHaveBeenCalledWith(5))
    expect(applySnapshotData).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        toastMessage: 'Snapshot recalled',
        invalidateChains: false,
      }),
    )
    expect(onRecall).toHaveBeenCalled()
    expect(queryClient.getQueryData(['snapshots', 'live'])).toEqual(
      expect.objectContaining({
        id: 5,
        name: 'Existing Snapshot',
      }),
    )
    expect(queryClient.getQueryData(['chains'])).toEqual(
      expect.objectContaining({
        count: 1,
        chains: expect.arrayContaining([
          expect.objectContaining({ id: 501, name: 'Existing Snapshot Path A (A)' }),
        ]),
      }),
    )
    expect(mockPushToast).not.toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error')
  })

  it('disables delete actions for the live snapshot in the library UI', async () => {
    mockSnapshotsList.mockResolvedValueOnce({
      snapshots: [
        {
          id: 5,
          name: 'Existing Snapshot',
          description: '',
          tags: [],
          program_number: null,
          input_device: null,
          output_device: null,
          is_active: true,
          is_favorite: false,
          display_order: 0,
          channels: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
          channel_count: 0,
          chain_count: 0,
          community_shared: false,
          community_download_count: 0,
          community_rating: null,
          community_rating_count: 0,
        },
      ],
      count: 1,
      active_id: 5,
    })

    renderContent()

    fireEvent.click(await screen.findByRole('button', { name: 'Load Existing' }))
    fireEvent.click(screen.getByRole('button', { name: /Snapshot Library/i }))
    fireEvent.click((await screen.findAllByLabelText('Actions for Existing Snapshot'))[0])

    const deleteAction = await screen.findByText('Delete')
    const deleteButton = deleteAction.closest('button') as HTMLButtonElement | null
    expect(deleteButton).not.toBeNull()
    expect(deleteButton?.disabled).toBe(true)
  })

  it('orders favorites by the persisted gig setlist and saves up/down reorders', async () => {
    mockSpecialSettings = {
      ...mockSpecialSettings,
      snapshotSetlistMode: true,
      snapshotSetlistOrder: [7, 5],
    }
    mockSnapshotsList.mockResolvedValueOnce({
      snapshots: [
        {
          id: 5,
          name: 'Intro',
          description: '',
          tags: [],
          program_number: 10,
          input_device: null,
          output_device: null,
          is_active: false,
          is_favorite: true,
          display_order: 0,
          channels: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
          channel_count: 0,
          chain_count: 0,
          community_shared: false,
          community_download_count: 0,
          community_rating: null,
          community_rating_count: 0,
        },
        {
          id: 7,
          name: 'Solo',
          description: '',
          tags: [],
          program_number: 20,
          input_device: null,
          output_device: null,
          is_active: false,
          is_favorite: true,
          display_order: 1,
          channels: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
          channel_count: 0,
          chain_count: 0,
          community_shared: false,
          community_download_count: 0,
          community_rating: null,
          community_rating_count: 0,
        },
        {
          id: 9,
          name: 'Outro',
          description: '',
          tags: [],
          program_number: 30,
          input_device: null,
          output_device: null,
          is_active: false,
          is_favorite: true,
          display_order: 2,
          channels: [],
          created_at: '2026-03-29T12:00:00Z',
          updated_at: '2026-03-29T12:00:00Z',
          channel_count: 0,
          chain_count: 0,
          community_shared: false,
          community_download_count: 0,
          community_rating: null,
          community_rating_count: 0,
        },
      ],
      count: 3,
      active_id: null,
    })

    renderContent()

    fireEvent.click(await screen.findByRole('button', { name: 'Load Existing' }))
    fireEvent.click(screen.getByRole('button', { name: /Snapshot Library/i }))

    const favoritesHeader = await screen.findByText('Favorites')
    const favoritesSection = favoritesHeader.closest('section')
    expect(favoritesSection).not.toBeNull()

    const orderedNames = within(favoritesSection as HTMLElement)
      .getAllByText(/^(Solo|Intro|Outro)$/)
      .map((element) => element.textContent)
    expect(orderedNames).toEqual(['Solo', 'Intro', 'Outro'])

    fireEvent.click(screen.getByRole('button', { name: 'Move Intro later in the gig setlist' }))

    await waitFor(() => expect(mockUpdateSpecialSettings).toHaveBeenCalledWith({
      snapshotSetlistOrder: [7, 9, 5],
    }))
    expect(mockPushToast).toHaveBeenCalledWith('Gig setlist order updated', 'success')
  })
})
