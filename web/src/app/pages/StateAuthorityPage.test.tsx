import { render, screen, act } from '@testing-library/react'
import { StateAuthorityPage } from './StateAuthorityPage'

jest.mock('../../map2/clients/stateAuthority', () => ({
  stateAuthorityApi: {
    getMorphState: jest.fn(async () => ({ x: 0.5, y: 0.5, configured_corners: [] })),
    setMorphPosition: jest.fn(async (x: number, y: number) => ({
      x,
      y,
      configured_corners: [],
    })),
    getCatalog: jest.fn(async () => ({
      entries: [
        {
          uri: 'map2:fx:nam',
          type: 'fx',
          name: 'nam',
          label: 'Neural Amp Modeler',
          description: 'amp modeler',
          category: 'amp',
          default_parameters: { gain: 0.7 },
          default_state: {},
          aliases: [],
          is_system_managed: false,
        },
      ],
      count: 1,
    })),
    getLiveDocument: jest.fn(async () => ({
      snapshot_id: 1,
      snapshot_name: 'Live Tone',
      is_live: true,
      document: { version: '2026.04' },
    })),
    getSnapshotDocument: jest.fn(async () => ({
      snapshot_id: 1,
      snapshot_name: 'Archived',
      is_live: false,
      document: { version: '2026.04' },
    })),
    getReconciliationMetrics: jest.fn(async () => ({
      metrics: {
        local_runs_total: 3,
        local_drift_detected_total: 0,
        local_corrections_applied_total: 0,
        local_reactivations_required_total: 0,
        cluster_runs_total: 0,
        cluster_nodes_with_drift_total: 0,
        last_local_reconcile_unix_s: 1_700_000_000,
        last_cluster_reconcile_unix_s: 0,
        last_local_status: 'healthy',
        last_cluster_status: 'never_run',
        last_local_error: null,
        last_cluster_error: null,
      },
      prometheus: '',
    })),
  },
}))

describe('StateAuthorityPage', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(window, 'matchMedia', {
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
  })
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders the four workspace tabs', async () => {
    await act(async () => {
      render(<StateAuthorityPage />)
    })
    expect(screen.getByRole('tab', { name: /morph pad/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /block picker/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /document/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /reconciliation/i })).toBeTruthy()
  })

  it('shows the State Authority header', async () => {
    await act(async () => {
      render(<StateAuthorityPage />)
    })
    expect(screen.getByRole('heading', { level: 1, name: /state authority/i })).toBeTruthy()
  })
})
