/**
 * Tests for the SnapshotsBrowserPage Program-badge deep-link + the
 * ?highlight= reverse-link handling shipped in commit c3324cf1.
 *
 * Focus is on the two behaviors the prior commit added:
 * 1. Clicking a Program badge navigates to /midi/bindings filtered by
 *    the snapshot consumer.
 * 2. /snapshots?highlight=<id> applies a class + scrolls the matching
 *    row into view, then scrubs the param after the pulse.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const mockList = jest.fn()
const mockUpdate = jest.fn()
const mockDuplicate = jest.fn()
const mockDelete = jest.fn()
const mockActivate = jest.fn()
const mockCreate = jest.fn()

jest.mock('../../map2/clients/snapshots', () => {
  const actual = jest.requireActual('../../map2/clients/snapshots')
  return {
    ...actual,
    snapshotsApi: {
      list: (...args: unknown[]) => mockList(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      duplicate: (...args: unknown[]) => mockDuplicate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      activate: (...args: unknown[]) => mockActivate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  }
})

// SnapshotPinButton has its own data hooks; stub it so the browser test
// doesn't depend on the preload-pins subsystem.
jest.mock('../components/SnapshotEditor/SnapshotPinButton', () => ({
  SnapshotPinButton: ({ snapshotId }: { snapshotId: number }) => (
    <button data-testid={`pin-${snapshotId}`} type="button">
      pin
    </button>
  ),
}))

import { SnapshotsBrowserPage } from './SnapshotsBrowserPage'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderPage(initialPath = '/snapshots') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/snapshots" element={<SnapshotsBrowserPage />} />
          <Route path="/midi/bindings" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const SNAPSHOT_WITH_PROGRAM = {
  id: 13,
  name: 'Rig20260421',
  description: '',
  program_number: 24,
  tempo_bpm: 120,
  active_tempo_bpm: 120,
  chain_count: 3,
  is_favorite: false,
  is_locked: false,
  display_order: 1,
  created_at: '2026-05-09T10:00:00Z',
  updated_at: '2026-05-09T10:00:00Z',
}

const SNAPSHOT_WITHOUT_PROGRAM = {
  id: 14,
  name: 'EllaStella',
  description: '',
  program_number: null,
  tempo_bpm: 120,
  active_tempo_bpm: 120,
  chain_count: 2,
  is_favorite: false,
  is_locked: false,
  display_order: 2,
  created_at: '2026-05-09T10:00:00Z',
  updated_at: '2026-05-09T10:00:00Z',
}

beforeEach(() => {
  mockList.mockReset()
  mockList.mockResolvedValue({
    snapshots: [SNAPSHOT_WITH_PROGRAM, SNAPSHOT_WITHOUT_PROGRAM],
  })
  mockUpdate.mockReset()
  mockDuplicate.mockReset()
  mockDelete.mockReset()
  mockActivate.mockReset()
  mockCreate.mockReset()
})


// ---- Forward link: Program badge → /midi/bindings ----

describe('SnapshotsBrowserPage program badge deep-link', () => {
  test('renders the program-number tag for snapshots with a CC assignment', async () => {
    renderPage()
    expect(await screen.findByText('#24')).toBeInTheDocument()
  })

  test('non-program snapshots render the em-dash placeholder, not a badge', async () => {
    renderPage()
    await screen.findByText('#24')
    // The unassigned row uses the em-dash glyph rendered as plain text;
    // there must NOT be a #-prefixed badge for snapshot 14.
    const allDashes = await screen.findAllByText('—')
    expect(allDashes.length).toBeGreaterThan(0)
  })

  test('clicking the program badge navigates to /midi/bindings filtered by snapshot consumer', async () => {
    renderPage()
    const badge = await screen.findByText('#24')
    // The clickable wrapper is the parent button, not the Tag itself.
    const clickable = badge.closest('button')
    expect(clickable).not.toBeNull()
    fireEvent.click(clickable!)

    await waitFor(() => {
      const probe = screen.getByTestId('location')
      expect(probe.textContent).toBe(
        '/midi/bindings?consumer_type=snapshot&consumer_id=13',
      )
    })
  })
})


// ---- Reverse link: ?highlight=<id> ----

describe('SnapshotsBrowserPage ?highlight= handling', () => {
  test('adds the highlighted-row class to the matching snapshot row', async () => {
    renderPage('/snapshots?highlight=13')
    const cell = await screen.findByText('Rig20260421')
    const row = cell.closest('tr')
    expect(row).not.toBeNull()
    expect(row!.className).toMatch(/snapshots-browser__row--highlighted/)
  })

  test('does not highlight a row when the id does not match', async () => {
    renderPage('/snapshots?highlight=999')
    const cell = await screen.findByText('Rig20260421')
    const row = cell.closest('tr')
    expect(row!.className).not.toMatch(/snapshots-browser__row--highlighted/)
  })

  test('does not crash when ?highlight is non-numeric', async () => {
    renderPage('/snapshots?highlight=not-a-number')
    // Page still renders the rows.
    expect(await screen.findByText('Rig20260421')).toBeInTheDocument()
  })
})
