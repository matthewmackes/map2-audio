/**
 * T2454 slice 1C — SnapshotPreloadSlotsPanel tests.
 *
 * Mocks the two transport hooks so we can exercise the panel in isolation:
 *  - useSnapshotPreloadPins (pin/unpin/reorder, cap=5)
 *  - useSnapshotPreloadStatus (warm/cold dot, preloadNow)
 *
 * The panel renders 5 slots regardless of how many pins exist; filled
 * slots show the snapshot name + warm/cold state; empty slots show
 * "Empty slot" with an "Add selected" affordance on the first empty slot
 * when a `selectedSnapshotId` is provided and not yet pinned.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotPreloadSlotsPanel } from './SnapshotPreloadSlotsPanel'

const mockPin = jest.fn()
const mockUnpin = jest.fn()
const mockReorder = jest.fn()
const mockPreloadNow = jest.fn()
const mockRefetchStatus = jest.fn()

let mockPins: number[] = []
let mockWarmIds: Set<number> = new Set()

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
    status: undefined,
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

beforeEach(() => {
  mockPin.mockReset()
  mockUnpin.mockReset()
  mockReorder.mockReset()
  mockPreloadNow.mockReset()
  mockRefetchStatus.mockReset()
  mockPin.mockResolvedValue({ ok: true })
  mockUnpin.mockResolvedValue({ ok: true })
  mockReorder.mockResolvedValue(undefined)
  mockPreloadNow.mockResolvedValue({ snapshot_id: 0, warm: true })
  mockPins = []
  mockWarmIds = new Set()
})

const baseNamesById = new Map<number, string>([
  [10, 'Studio Clean'],
  [11, 'Stadium Lead'],
  [12, 'Bedroom Crunch'],
  [13, 'Ambient Pad'],
  [14, 'Tape Slap'],
  [15, 'Lex Lush Verb'],
])

it('renders five slots regardless of pin count and labels filled vs empty', () => {
  mockPins = [10, 11]
  mockWarmIds = new Set([10])

  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  // Two filled rows: warm + cold.
  expect(screen.getByText('Studio Clean')).toBeInTheDocument()
  expect(screen.getByText('Stadium Lead')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(screen.getByText('Cold')).toBeInTheDocument()
  // Three empty slots.
  expect(screen.getAllByText('Empty slot')).toHaveLength(3)
  // Cap counter.
  expect(screen.getByText('2/5')).toBeInTheDocument()
})

it('shows "Add selected" on the first empty slot when selectedSnapshotId is fresh', () => {
  mockPins = [10]
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={20} />)

  const button = screen.getByRole('button', { name: /add selected/i })
  expect(button).toBeInTheDocument()
})

it('hides "Add selected" when the selected snapshot is already pinned', () => {
  mockPins = [10, 20]
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={20} />)

  expect(screen.queryByRole('button', { name: /add selected/i })).toBeNull()
})

it('hides "Add selected" once the cap of 5 is reached', () => {
  mockPins = [10, 11, 12, 13, 14]
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={20} />)

  // Cap-reached tag is cyan and reads 5/5.
  expect(screen.getByText('5/5')).toBeInTheDocument()
  // No empty slot is rendered when 5 are filled, so no "Add selected".
  expect(screen.queryByRole('button', { name: /add selected/i })).toBeNull()
})

it('clicking unpin calls unpin() with the correct snapshot id', async () => {
  mockPins = [10]
  mockWarmIds = new Set([10])
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  fireEvent.click(screen.getByRole('button', { name: /unpin/i }))
  await Promise.resolve()
  expect(mockUnpin).toHaveBeenCalledWith(10)
})

it('move down on the first slot reorders pins[1] up', async () => {
  mockPins = [10, 11, 12]
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  // The first slot's "Move down" button is the first one rendered.
  const moveDownButtons = screen.getAllByRole('button', { name: /move down/i })
  fireEvent.click(moveDownButtons[0])
  await Promise.resolve()
  expect(mockReorder).toHaveBeenCalledWith([11, 10, 12])
})

it('cold pinned slots expose a "Warm now" action that calls preloadNow', async () => {
  mockPins = [11]
  mockWarmIds = new Set()
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  const warmNow = screen.getByRole('button', { name: /warm now/i })
  fireEvent.click(warmNow)
  // Wait two microtasks so the async handler chain (preloadNow → refetch) settles.
  await Promise.resolve()
  await Promise.resolve()
  expect(mockPreloadNow).toHaveBeenCalledWith(11)
})

it('warm pinned slots do not show the Warm now action', () => {
  mockPins = [11]
  mockWarmIds = new Set([11])
  render(<SnapshotPreloadSlotsPanel snapshotNamesById={baseNamesById} selectedSnapshotId={null} />)

  expect(screen.queryByRole('button', { name: /warm now/i })).toBeNull()
})
