/**
 * T2454-D — SnapshotPinButton tests.
 *
 * Cyan-fill on pinned, disabled tooltip on cap-reached, click toggles pin.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotPinButton } from './SnapshotPinButton'

const mockPin = jest.fn()
const mockUnpin = jest.fn()
const mockPreloadNow = jest.fn()
const mockRefetch = jest.fn()

let mockPins: number[] = []
let mockCapReached = false

jest.mock('../../hooks/useSnapshotPreloadPins', () => ({
  __esModule: true,
  SNAPSHOT_PRELOAD_PIN_LIMIT: 5,
  useSnapshotPreloadPins: () => ({
    pins: mockPins,
    isLoading: false,
    error: null,
    isPinned: (id: number) => mockPins.includes(id),
    isCapReached: mockCapReached,
    pin: mockPin,
    unpin: mockUnpin,
    reorder: jest.fn(),
  }),
}))

jest.mock('../../hooks/useSnapshotPreloadStatus', () => ({
  __esModule: true,
  useSnapshotPreloadStatus: () => ({
    status: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    isWarm: () => false,
    isPinned: (id: number) => mockPins.includes(id),
    refetch: mockRefetch,
    preloadNow: mockPreloadNow,
    isPreloading: false,
  }),
}))

beforeEach(() => {
  mockPin.mockReset()
  mockUnpin.mockReset()
  mockPreloadNow.mockReset()
  mockRefetch.mockReset()
  mockPin.mockResolvedValue({ ok: true })
  mockUnpin.mockResolvedValue({ ok: true })
  mockPreloadNow.mockResolvedValue({ snapshot_id: 0, warm: true })
  mockPins = []
  mockCapReached = false
})

it('renders an unpinned button when the snapshot is not in the pin set', () => {
  render(<SnapshotPinButton snapshotId={42} />)
  const button = screen.getByRole('button', { name: /pin to preload slots/i })
  expect(button).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(button).toHaveAttribute('data-pinned', 'false')
  expect(button).not.toBeDisabled()
})

it('renders a pinned button when the snapshot is already in the pin set', () => {
  mockPins = [42]
  render(<SnapshotPinButton snapshotId={42} />)
  const button = screen.getByRole('button', { name: /unpin from preload slots/i })
  expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(button).toHaveAttribute('data-pinned', 'true')
})

it('disables the button with a cap-reached tooltip when the cap is reached and the snapshot is not pinned', () => {
  mockPins = [10, 11, 12, 13, 14]
  mockCapReached = true
  render(<SnapshotPinButton snapshotId={42} />)
  const button = screen.getByRole('button', { name: /pin set full \(5\/5\)/i })
  expect(button).toBeDisabled()
})

it('still allows unpinning when the cap is reached and the snapshot IS pinned', () => {
  mockPins = [10, 11, 12, 13, 42]
  mockCapReached = true
  render(<SnapshotPinButton snapshotId={42} />)
  const button = screen.getByRole('button', { name: /unpin from preload slots/i })
  expect(button).not.toBeDisabled()
})

it('clicking an unpinned button calls pin() and then preloadNow()', async () => {
  render(<SnapshotPinButton snapshotId={77} />)
  fireEvent.click(screen.getByRole('button', { name: /pin to preload slots/i }))
  // Three microtasks: setIsBusy(true) → pin(77) → preloadNow(77) → refetch().
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(mockPin).toHaveBeenCalledWith(77)
  expect(mockPreloadNow).toHaveBeenCalledWith(77)
})

it('clicking a pinned button calls unpin() and skips preloadNow', async () => {
  mockPins = [77]
  render(<SnapshotPinButton snapshotId={77} />)
  fireEvent.click(screen.getByRole('button', { name: /unpin from preload slots/i }))
  await Promise.resolve()
  await Promise.resolve()
  expect(mockUnpin).toHaveBeenCalledWith(77)
  expect(mockPreloadNow).not.toHaveBeenCalled()
})
