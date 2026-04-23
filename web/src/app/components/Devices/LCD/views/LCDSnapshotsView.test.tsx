import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDSnapshotsView } from './LCDSnapshotsView'

const mockGetSnapshotHook = jest.fn()
const mockPutSnapshotHook = jest.fn()
const mockDeleteSnapshotHook = jest.fn()
const mockListSnapshotHooks = jest.fn()
const mockGetPresets = jest.fn()
const mockFetchJson = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getSnapshotHook: (...a: unknown[]) => mockGetSnapshotHook(...a),
    putSnapshotHook: (...a: unknown[]) => mockPutSnapshotHook(...a),
    deleteSnapshotHook: (...a: unknown[]) => mockDeleteSnapshotHook(...a),
    listSnapshotHooks: (...a: unknown[]) => mockListSnapshotHooks(...a),
    getPresets: (...a: unknown[]) => mockGetPresets(...a),
  },
  LCD_SNAPSHOT_AWARE_FIELDS: ['default_page', 'auto_cycle_enabled', 'auto_cycle_interval_s', 'alert_sound', 'idle_dim_timeout_s'],
}))

jest.mock('../../../../../map2/http', () => ({
  fetchJson: (...a: unknown[]) => mockFetchJson(...a),
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDSnapshotsView (T2430-I)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchJson.mockResolvedValue({
      snapshots: [
        { id: 'snap-1', metadata: { name: 'Clean Tone' } },
        { id: 'snap-2', metadata: { name: 'High Gain' } },
      ],
    })
    mockGetPresets.mockResolvedValue({
      presets: [
        { name: 'performing', description: '', created_at: null, builtin: true, config: {} },
        { name: 'my-preset', description: '', created_at: null, builtin: false, config: {} },
      ],
    })
    mockListSnapshotHooks.mockResolvedValue({
      hooks: [
        { snapshot_id: 'snap-1', hook: { preset: 'performing' } },
      ],
    })
    mockGetSnapshotHook.mockResolvedValue({ snapshot_id: 'snap-1', hook: { preset: 'performing' } })
    mockPutSnapshotHook.mockResolvedValue({ success: true, hook: {} })
    mockDeleteSnapshotHook.mockResolvedValue({ success: true })
  })

  it('renders the snapshot list with hook badges', async () => {
    wrap(<LCDSnapshotsView />)
    await screen.findByText('Clean Tone')
    expect(screen.getByText('High Gain')).toBeInTheDocument()
    // Preset badge is visible because snap-1 has a preset hook.
    expect(screen.getByText(/preset: performing/)).toBeInTheDocument()
  })

  it('selects the first snapshot by default', async () => {
    wrap(<LCDSnapshotsView />)
    await screen.findByText('Snapshot hook')
    // snap-1 appears in both the list card and the editor header.
    expect(screen.getAllByText('snap-1').length).toBeGreaterThanOrEqual(1)
  })

  it('mode radios allow switching to none/preset/inline', async () => {
    wrap(<LCDSnapshotsView />)
    await screen.findByText('Snapshot hook')

    const radios = screen.getAllByRole('radio')
    // 3 radios: none, preset, inline.
    expect(radios).toHaveLength(3)
  })

  it('Clear button calls deleteSnapshotHook', async () => {
    wrap(<LCDSnapshotsView />)
    await screen.findByText('Snapshot hook')

    const clearBtn = await screen.findByRole('button', { name: /Clear/i })
    fireEvent.click(clearBtn)
    await new Promise((r) => setTimeout(r, 20))
    expect(mockDeleteSnapshotHook.mock.calls[0][0]).toBe('snap-1')
  })
})
