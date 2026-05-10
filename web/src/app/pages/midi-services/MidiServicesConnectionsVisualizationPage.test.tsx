/**
 * T2500-MV-F2 — visualization page smoke test.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

import { MidiServicesConnectionsVisualizationPage } from './MidiServicesConnectionsVisualizationPage'

// Mock the hook inside which depends on a live WS — we only smoke-test
// the page's composition + empty-state path here. The hook itself has
// dedicated unit tests in useMidiVisualizationGraph.test.tsx.
jest.mock('../../hooks/useMidiVisualizationGraph', () => ({
  useMidiVisualizationGraph: () => ({
    topology: { nodes: [], edges: [] },
    edgeActivity: new Map(),
    nodeActivity: new Map(),
    status: 'live',
    filters: {
      dropClockAndActiveSense: true,
      eventKind: 'both',
      intensity: 1,
      scopeActiveLast60s: true,
    },
    setFilters: jest.fn(),
  }),
}))

// useMidiServicesShellWindow taps into the parent shell — stub it out
// so the page renders without that surrounding context.
jest.mock('./useMidiServicesShellWindow', () => ({
  useMidiServicesShellWindow: () => undefined,
}))

function wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/midi/connections/visualization']}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MidiServicesConnectionsVisualizationPage', () => {
  it('renders the page chrome + outer-tab strip + filter bar', async () => {
    render(<MidiServicesConnectionsVisualizationPage />, { wrapper: wrap })
    expect(
      await screen.findByRole('heading', {
        name: /Connections — Visualization/,
      }),
    ).toBeTruthy()
    // Outer tab strip provides Overview + Visualization links.
    expect(screen.getByRole('link', { name: /Overview/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Visualization/ })).toBeTruthy()
    // Filter bar surfaces the four standard controls.
    expect(screen.getByLabelText(/MIDI clock/)).toBeTruthy()
    expect(screen.getByLabelText(/Active in last 60s/)).toBeTruthy()
    expect(screen.getByText(/Intensity/)).toBeTruthy()
  })

  it('shows the empty-state message when the topology is empty', async () => {
    render(<MidiServicesConnectionsVisualizationPage />, { wrapper: wrap })
    await waitFor(() => {
      expect(
        screen.getByText(/No active MIDI connections/),
      ).toBeTruthy()
    })
  })
})
