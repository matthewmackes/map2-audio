import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschinePhaseStrip } from './MaschinePhaseStrip'

// T2522-D cycle 11 — State Authority phase strip unit tests.

jest.mock('../../../map2/clients/stateAuthority', () => ({
  __esModule: true,
  stateAuthorityApi: {
    getReconciliationMetrics: jest.fn(),
  },
}))

const { stateAuthorityApi } = jest.requireMock('../../../map2/clients/stateAuthority') as {
  stateAuthorityApi: { getReconciliationMetrics: jest.Mock }
}

function withQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

beforeEach(() => {
  stateAuthorityApi.getReconciliationMetrics.mockReset()
})

function makeMetrics(overrides: Record<string, unknown> = {}) {
  return {
    metrics: {
      local_runs_total: 12,
      local_drift_detected_total: 1,
      local_corrections_applied_total: 1,
      local_reactivations_required_total: 0,
      cluster_runs_total: 0,
      cluster_nodes_with_drift_total: 0,
      last_local_reconcile_unix_s: Math.floor(Date.now() / 1000) - 30,
      last_cluster_reconcile_unix_s: 0,
      last_local_status: 'LIVE',
      last_cluster_status: 'IDLE',
      last_local_error: null,
      last_cluster_error: null,
      ...overrides,
    },
    prometheus: '',
  }
}

describe('MaschinePhaseStrip', () => {
  it('fetches metrics and shows the LIVE phase tag + counters', async () => {
    stateAuthorityApi.getReconciliationMetrics.mockResolvedValue(makeMetrics())
    render(withQuery(<MaschinePhaseStrip />))
    expect(await screen.findByText('LIVE')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    // The Q71 hint copy for LIVE.
    expect(screen.getByText(/snapshot bank lit green/)).toBeInTheDocument()
  })

  it('normalises an unknown / OK status to LIVE', async () => {
    stateAuthorityApi.getReconciliationMetrics.mockResolvedValue(
      makeMetrics({ last_local_status: 'OK' }),
    )
    render(withQuery(<MaschinePhaseStrip />))
    expect(await screen.findByText('LIVE')).toBeInTheDocument()
  })

  it('renders ERROR when last_local_error is non-null', async () => {
    stateAuthorityApi.getReconciliationMetrics.mockResolvedValue(
      makeMetrics({ last_local_status: 'ERROR', last_local_error: 'sched failed' }),
    )
    render(withQuery(<MaschinePhaseStrip />))
    expect(await screen.findByText('ERROR')).toBeInTheDocument()
    expect(screen.getByText('sched failed')).toBeInTheDocument()
  })

  it('falls back to IDLE when last_local_status is empty', async () => {
    stateAuthorityApi.getReconciliationMetrics.mockResolvedValue(makeMetrics({ last_local_status: '' }))
    render(withQuery(<MaschinePhaseStrip />))
    await waitFor(() => expect(stateAuthorityApi.getReconciliationMetrics).toHaveBeenCalled())
    expect(await screen.findByText('IDLE')).toBeInTheDocument()
  })

  it('shows the canonical APPLYING phase + LED hint', async () => {
    stateAuthorityApi.getReconciliationMetrics.mockResolvedValue(
      makeMetrics({ last_local_status: 'APPLYING' }),
    )
    render(withQuery(<MaschinePhaseStrip />))
    expect(await screen.findByText('APPLYING')).toBeInTheDocument()
    expect(screen.getByText(/all groups solid magenta/)).toBeInTheDocument()
  })
})
