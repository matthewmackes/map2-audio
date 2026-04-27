/**
 * T2454-G — SnapshotPreloadSlotsPanel tests (pedalboard redesign).
 *
 * Mocks the four data hooks + the snapshotsApi mutation surface so we can
 * exercise the panel's render and action wiring in isolation. The new
 * panel is a 5-column grid with per-slot Recall / Lock / Reload / Eject /
 * MIDI-bind actions, so the assertions cover those paths plus the
 * lock-confirm modal.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { SnapshotPreloadSlotsPanel } from './SnapshotPreloadSlotsPanel'

// ── Hook mocks ────────────────────────────────────────────────

const mockPin = jest.fn()
const mockUnpin = jest.fn()
const mockReorder = jest.fn()
const mockPreloadNow = jest.fn()
const mockRefetchStatus = jest.fn()

let mockPins: number[] = []
let mockWarmIds: Set<number> = new Set()
let mockLiveSnapshotId: number | null = null

jest.mock('../../hooks/useSnapshotPreloadPins', () => ({
  __esModule: true,
  SNAPSHOT_PRELOAD_PIN_LIMIT: 5,
  useSnapshotPreloadPins: () => ({
    pins: mockPins,
    isLoading: false,
    error: null as string | null,
    isPinned: (id: number) => mockPins.includes(id),
    isCapReached: mockPins.length >= 5,
    pin: mockPin,
    unpin: mockUnpin,
    reorder: mockReorder,
  }),
}))

jest.mock('../../hooks/useSnapshotPreloadStatus', () => ({
  __esModule: true,
  useSnapshotPreloadStatus: () => ({
    status: {
      pinned_count: mockPins.length,
      warm_count: mockWarmIds.size,
      slots: mockPins.map((id) => ({
        snapshot_id: id,
        warm: mockWarmIds.has(id),
        version: 1,
        warmed_at: null,
        staged_instance_count: mockWarmIds.has(id) ? 3 : 0,
        last_error: null,
      })),
    },
    isLoading: false,
    isFetching: false,
    error: null,
    isWarm: (id: number) => mockWarmIds.has(id),
    isPinned: (id: number) => mockPins.includes(id),
    refetch: mockRefetchStatus,
    preloadNow: mockPreloadNow,
    isPreloading: false,
  }),
}))

jest.mock('../../hooks/useSnapshotLive', () => ({
  __esModule: true,
  useSnapshotLive: () => ({
    liveSnapshotId: mockLiveSnapshotId,
    liveSnapshot: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

const buildDetail = (id: number, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  name: `Snapshot ${id}`,
  description: '',
  tags: [],
  program_number: null,
  is_locked: false,
  is_favorite: false,
  display_order: 0,
  channels: [],
  channel_count: 0,
  chain_count: 1,
  community_shared: false,
  input_device: null,
  output_device: null,
  chains: [
    {
      id: 1,
      name: 'main',
      plugins: [
        { id: 1, uri: 'noise-gate', name: 'Gate', position: 0, bypass: false, parameters: {} },
        { id: 2, uri: 'compressor', name: 'Comp', position: 1, bypass: false, parameters: {} },
        { id: 3, uri: 'amplifier', name: 'Twin', position: 2, bypass: false, parameters: {} },
      ],
    },
  ],
  ...overrides,
})

let mockDetailsById = new Map<number, ReturnType<typeof buildDetail>>()

jest.mock('../../hooks/useSnapshotPinDetails', () => ({
  __esModule: true,
  useSnapshotPinDetails: (pinnedIds: ReadonlyArray<number>) => ({
    detailsById: new Map(
      pinnedIds.map((id) => [id, mockDetailsById.get(id) ?? buildDetail(id)]),
    ),
    statusById: new Map(),
    isAnyLoading: false,
    refetchAll: jest.fn(),
    refetch: jest.fn(),
  }),
}))

const mockActivate = jest.fn()
const mockUpdate = jest.fn()
const mockSetProgram = jest.fn()

jest.mock('../../../map2/clients/snapshots', () => ({
  __esModule: true,
  snapshotsApi: {
    activate: (...args: unknown[]) => mockActivate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    setProgram: (...args: unknown[]) => mockSetProgram(...args),
  },
}))

const mockInvalidateQueries = jest.fn(() => Promise.resolve())
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

// ── Test setup ────────────────────────────────────────────────

beforeEach(() => {
  // jsdom doesn't ship ResizeObserver / matchMedia, both used by @carbon/react.
  ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    })
  }
  mockPin.mockReset()
  mockUnpin.mockReset()
  mockReorder.mockReset()
  mockPreloadNow.mockReset()
  mockRefetchStatus.mockReset()
  mockActivate.mockReset()
  mockUpdate.mockReset()
  mockSetProgram.mockReset()
  mockInvalidateQueries.mockReset()
  mockInvalidateQueries.mockReturnValue(Promise.resolve())
  mockPin.mockResolvedValue({ ok: true })
  mockUnpin.mockResolvedValue({ ok: true })
  mockReorder.mockResolvedValue(undefined)
  mockPreloadNow.mockResolvedValue({ snapshot_id: 0, warm: true })
  mockActivate.mockResolvedValue({ status: 'success' })
  mockUpdate.mockResolvedValue({ status: 'success' })
  mockSetProgram.mockResolvedValue({ status: 'success' })

  mockPins = []
  mockWarmIds = new Set()
  mockLiveSnapshotId = null
  mockDetailsById = new Map()
})

const baseNamesById = new Map<number, string>([
  [10, 'Studio Clean'],
  [11, 'Stadium Lead'],
  [12, 'Bedroom Crunch'],
])

// ── Cases ─────────────────────────────────────────────────────

it('renders 5 slots: filled cells show name + state, remaining show Empty', () => {
  mockPins = [10, 11]
  mockWarmIds = new Set([10])
  mockLiveSnapshotId = null

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  expect(screen.getByText('Snapshot 10')).toBeInTheDocument()
  expect(screen.getByText('Snapshot 11')).toBeInTheDocument()
  // Ready chip on the warm slot.
  expect(screen.getByText('Ready')).toBeInTheDocument()
  // 'Cold' appears on both the state chip and the disabled Recall button of
  // the cold slot, so allow ≥ 1 match.
  expect(screen.getAllByText('Cold').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('Empty')).toHaveLength(3)
  expect(screen.getByText('2/5')).toBeInTheDocument()
})

it('marks the slot as live when liveSnapshotId matches', () => {
  mockPins = [10, 11]
  mockWarmIds = new Set([10, 11])
  mockLiveSnapshotId = 11

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  // The live slot's recall button reads "Active" and is disabled.
  const activeBtn = screen.getByRole('button', { name: /currently active/i })
  expect(activeBtn).toBeDisabled()
  expect(activeBtn).toHaveTextContent(/Active/i)
  expect(screen.getByText(/On Air/i)).toBeInTheDocument()
})

it('Recall click calls snapshotsApi.activate(id)', async () => {
  mockPins = [10, 11]
  mockWarmIds = new Set([10, 11])
  mockLiveSnapshotId = 10

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  // Recall button on slot 11 (the warm-but-not-live one).
  fireEvent.click(screen.getByRole('button', { name: /recall snapshot 11/i }))
  await Promise.resolve()
  expect(mockActivate).toHaveBeenCalledWith(11)
})

it('Recall is disabled on cold slots', () => {
  mockPins = [10]
  mockWarmIds = new Set()
  mockLiveSnapshotId = null

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)
  const recall = screen.getByRole('button', { name: /recall snapshot 10/i })
  expect(recall).toBeDisabled()
})

it('Lock toggle PATCHes is_locked', async () => {
  mockPins = [10]
  mockWarmIds = new Set([10])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /lock snapshot 10/i }))
  await Promise.resolve()
  await Promise.resolve()
  expect(mockUpdate).toHaveBeenCalledWith(10, { is_locked: true })
})

it('Reload (re-warm) calls preloadNow', async () => {
  mockPins = [10]
  mockWarmIds = new Set([10])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /reload snapshot 10 from disk/i }))
  await Promise.resolve()
  await Promise.resolve()
  expect(mockPreloadNow).toHaveBeenCalledWith(10)
})

it('Eject on an unlocked slot unpins immediately', async () => {
  mockPins = [10]

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /eject snapshot 10/i }))
  await Promise.resolve()
  expect(mockUnpin).toHaveBeenCalledWith(10)
})

it('Eject on a locked slot opens a confirm modal and only unpins on Eject click', async () => {
  mockPins = [10]
  mockDetailsById = new Map([[10, buildDetail(10, { is_locked: true })]])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /eject snapshot 10/i }))
  // Modal opens, eject not called yet.
  expect(mockUnpin).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('dialog')
  // Confirm. Carbon's danger primary button accessible name reads
  // "danger Eject" (the "danger" describedby is prepended).
  fireEvent.click(within(dialog).getByRole('button', { name: /Eject/i, hidden: false }))
  await Promise.resolve()
  await Promise.resolve()
  expect(mockUnpin).toHaveBeenCalledWith(10)
})

it('MIDI chip click reveals editable input; Enter commits via setProgram', async () => {
  mockPins = [10]
  mockDetailsById = new Map([[10, buildDetail(10, { program_number: 5 })]])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /set midi program change/i }))
  const input = await screen.findByRole('textbox', { name: /edit midi program change/i })
  fireEvent.change(input, { target: { value: '42' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await Promise.resolve()
  await Promise.resolve()
  expect(mockSetProgram).toHaveBeenCalledWith(10, 42)
})

it('cold slots expose a "Warm" button that calls preloadNow', async () => {
  mockPins = [11]
  mockWarmIds = new Set()

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  const warmBtn = screen.getByRole('button', { name: /warm snapshot 11 now/i })
  fireEvent.click(warmBtn)
  await Promise.resolve()
  await Promise.resolve()
  expect(mockPreloadNow).toHaveBeenCalledWith(11)
})

it('shows "Add selected" in the first empty slot when a fresh selectedSnapshotId is provided', () => {
  mockPins = [10]

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={20} />)
  expect(screen.getByRole('button', { name: /add selected/i })).toBeInTheDocument()
})

it('hides "Add selected" once the cap of 5 is reached', () => {
  mockPins = [10, 11, 12, 13, 14]

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={20} />)
  expect(screen.getByText('5/5')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add selected/i })).toBeNull()
})

it('renders the pedalboard preview from the snapshot detail', () => {
  mockPins = [10]
  mockWarmIds = new Set([10])
  mockDetailsById = new Map([[10, buildDetail(10)]])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  expect(screen.getByText('Gate')).toBeInTheDocument()
  expect(screen.getByText('Comp')).toBeInTheDocument()
  expect(screen.getByText('Twin')).toBeInTheDocument()
  expect(screen.getByText('signal chain')).toBeInTheDocument()
})
