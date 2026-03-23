import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JuceGridClusterSummaryBar } from './JuceGridClusterPanels'

function renderClusterSummaryBar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <JuceGridClusterSummaryBar />
    </QueryClientProvider>,
  )
}

describe('JuceGridClusterSummaryBar', () => {
  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.endsWith('/deployment/mode')) {
        return {
          ok: true,
          json: async () => ({
            mode: 'CLUSTER',
            description: 'Cluster mode',
          }),
        } as Response
      }

      if (url.endsWith('/cluster/nodes')) {
        return {
          ok: true,
          json: async () => undefined,
        } as Response
      }

      if (url.endsWith('/cluster/flows/assignments')) {
        return {
          ok: true,
          json: async () => ({
            assignments: [],
            total: 0,
          }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('falls back to an empty node list when the cluster nodes payload is undefined', async () => {
    renderClusterSummaryBar()

    await waitFor(() => {
      expect(screen.getByText('No cluster nodes detected.')).toBeTruthy()
    })

    expect(screen.getByText('0/0 online')).toBeTruthy()
    expect(screen.getByText('No cluster flow assignments are active yet.')).toBeTruthy()
  })
})
