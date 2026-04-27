/**
 * DeviceCard — T2459-G4 unit tests.
 *
 * Verifies Q6/Q11/Q12/Q15 surfaces:
 *   - 4 action buttons render (Open / Pin / Configure / Test or Identify).
 *   - Pin button calls pinDeviceProfile and shows an Undo toast.
 *   - Connected status shows the green tag.
 *   - Recently-disconnected sets data-recently-disconnected="true".
 *   - Source tag renders for shipped/user/imported.
 */

import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  pinDeviceProfile: jest.fn(async () => ({
    profile_key: 'edirol-ua/ua-1000.audio',
    pinned: true,
    newly_added: true,
  })),
  unpinDeviceProfile: jest.fn(async () => ({
    profile_key: 'edirol-ua/ua-1000.audio',
    pinned: false,
    newly_removed: true,
  })),
}))

const mockPushToast = jest.fn(() => 'toast-id-1')
const mockDismissToast = jest.fn()

jest.mock('../Toasts', () => ({
  __esModule: true,
  useToasts: () => ({
    pushToast: mockPushToast,
    dismissToast: mockDismissToast,
  }),
  useNotifications: () => ({
    pushNotification: mockPushToast,
    dismissNotification: mockDismissToast,
  }),
}))

import { DeviceCard, type DeviceCardRow } from './DeviceCard'
import { pinDeviceProfile, unpinDeviceProfile } from '../../../map2/clients/devices'

afterEach(() => {
  mockPushToast.mockClear()
  mockDismissToast.mockClear()
  ;(pinDeviceProfile as jest.Mock).mockClear()
  ;(unpinDeviceProfile as jest.Mock).mockClear()
})

function renderCard(overrides?: Partial<DeviceCardRow>) {
  const row: DeviceCardRow = {
    profileKey: 'edirol-ua/ua-1000.audio',
    packId: 'edirol-ua',
    model: 'ua-1000',
    kind: 'audio',
    vendor: 'EDIROL / Roland',
    source: 'shipped',
    isDegraded: false,
    isConnected: true,
    isPinned: false,
    recentlyDisconnected: false,
    lastSeenAt: null,
    ...overrides,
  }
  return render(
    <MemoryRouter>
      <DeviceCard row={row} onPinChanged={jest.fn()} />
    </MemoryRouter>,
  )
}

test('DeviceCard: Q6 — renders all four action buttons (audio kind)', () => {
  renderCard({ kind: 'audio' })
  expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Test latency' })).toBeInTheDocument()
})

test('DeviceCard: Q6 — Identify button label for MIDI kind', () => {
  renderCard({ kind: 'midi' })
  expect(screen.getByRole('button', { name: 'Identify' })).toBeInTheDocument()
})

test('DeviceCard: Q12 — renders Connected badge when isConnected', () => {
  renderCard({ isConnected: true })
  expect(screen.getByText('Connected')).toBeInTheDocument()
})

test('DeviceCard: Q12 — recently-disconnected data attr + warning badge', () => {
  const { container } = renderCard({
    isConnected: false,
    recentlyDisconnected: true,
  })
  const tile = container.querySelector('[data-profile-key]')
  expect(tile?.getAttribute('data-recently-disconnected')).toBe('true')
  expect(screen.getByText(/Disconnected \(recent\)/)).toBeInTheDocument()
})

test('DeviceCard: Q15 — renders source tag when source is set', () => {
  renderCard({ source: 'imported' })
  expect(screen.getByText('Imported')).toBeInTheDocument()
})

test('DeviceCard: G8 — diagnostic count tag renders with worst-severity tone', () => {
  renderCard({ diagnosticCount: 3, diagnosticWorstSeverity: 'error' })
  // "3 errors" — pluralised when count > 1.
  expect(screen.getByText('3 errors')).toBeInTheDocument()
})

test('DeviceCard: G8 — single diagnostic uses singular form', () => {
  renderCard({ diagnosticCount: 1, diagnosticWorstSeverity: 'warning' })
  expect(screen.getByText('1 warning')).toBeInTheDocument()
})

test('DeviceCard: G8 — no diagnostic tag when count is 0', () => {
  renderCard({ diagnosticCount: 0, diagnosticWorstSeverity: 'info' })
  expect(screen.queryByText(/0 info/)).not.toBeInTheDocument()
})

test('DeviceCard: T2461-A3 — last-bound row renders when lastBoundAt is set', () => {
  const tenMinAgo = Math.floor(Date.now() / 1000) - 10 * 60
  renderCard({ lastBoundAt: tenMinAgo, isConnected: false })
  expect(screen.getByText(/Bound \d+m ago/)).toBeInTheDocument()
})

test('DeviceCard: T2461-A3 — last-bound row hidden when lastBoundAt is null', () => {
  renderCard({ lastBoundAt: null, isConnected: false })
  expect(screen.queryByText(/Bound \d+/)).not.toBeInTheDocument()
})

test('DeviceCard: T2461-A7 — step-pads capability renders Brain Step deep-link', () => {
  renderCard({ capabilities: ['step-pads', 'midi'] })
  const link = screen.getByText('Brain Step').closest('a')
  expect(link?.getAttribute('href')).toContain('/brain?section=step')
  expect(link?.getAttribute('href')).toContain('device=edirol-ua%2Fua-1000.audio')
})

test('DeviceCard: T2461-A7 — monitor-mixer capability renders Brain Console deep-link', () => {
  renderCard({ capabilities: ['monitor-mixer'] })
  const link = screen.getByText('Brain Console').closest('a')
  expect(link?.getAttribute('href')).toContain('/brain?section=console')
})

test('DeviceCard: T2461-A7 — no Brain tag when no matching capability', () => {
  renderCard({ capabilities: ['some-unrelated-cap'] })
  expect(screen.queryByText(/^Brain /)).not.toBeInTheDocument()
})

test('DeviceCard: T2461-A7 — first matching capability wins (priority order)', () => {
  // step-pads has priority over monitor-mixer.
  renderCard({ capabilities: ['monitor-mixer', 'step-pads'] })
  expect(screen.getByText('Brain Step')).toBeInTheDocument()
  expect(screen.queryByText('Brain Console')).not.toBeInTheDocument()
})

test('DeviceCard: Pin button calls pinDeviceProfile + shows Undo toast', async () => {
  renderCard({ isPinned: false })

  fireEvent.click(screen.getByRole('button', { name: 'Pin' }))

  await waitFor(() => {
    expect(pinDeviceProfile).toHaveBeenCalledWith('edirol-ua/ua-1000.audio')
  })
  await waitFor(() => {
    const calls = mockPushToast.mock.calls
    const found = calls.some(
      (c) => typeof c[0] === 'string' && c[0].includes('Pinned ua-1000'),
    )
    expect(found).toBe(true)
  })
})

test('DeviceCard: Unpin button calls unpinDeviceProfile', async () => {
  renderCard({ isPinned: true })

  // Carbon's danger--ghost button adds an aria-describedby ("danger")
  // that prepends to the accessible name, so we match the suffix.
  fireEvent.click(screen.getByRole('button', { name: /Unpin/ }))

  await waitFor(() => {
    expect(unpinDeviceProfile).toHaveBeenCalledWith('edirol-ua/ua-1000.audio')
  })
})

test('DeviceCard: Q11 — pulseToken triggers --pulse class then clears', async () => {
  jest.useFakeTimers()
  try {
    const { container, rerender } = render(
      <MemoryRouter>
        <DeviceCard
          row={{
            profileKey: 'edirol-ua/ua-1000.audio',
            packId: 'edirol-ua',
            model: 'ua-1000',
            kind: 'audio',
            isConnected: true,
            isPinned: false,
            lastSeenAt: null,
            pulseToken: 1,
          }}
        />
      </MemoryRouter>,
    )
    const tile = container.querySelector('[data-profile-key]') as HTMLElement
    expect(tile.className).toContain('device-card--pulse')

    act(() => {
      jest.advanceTimersByTime(1500)
    })
    rerender(
      <MemoryRouter>
        <DeviceCard
          row={{
            profileKey: 'edirol-ua/ua-1000.audio',
            packId: 'edirol-ua',
            model: 'ua-1000',
            kind: 'audio',
            isConnected: true,
            isPinned: false,
            lastSeenAt: null,
            pulseToken: 1, // unchanged → no new pulse
          }}
        />
      </MemoryRouter>,
    )
    expect(tile.className).not.toContain('device-card--pulse')
  } finally {
    jest.useRealTimers()
  }
})
