import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PlatformRemediationWorkflow } from './PlatformRemediationWorkflow'

const originalFetch = global.fetch

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function renderWorkflow(props: Partial<React.ComponentProps<typeof PlatformRemediationWorkflow>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PlatformRemediationWorkflow mode="adoption" embedded {...props} />
    </QueryClientProvider>,
  )
}

describe('PlatformRemediationWorkflow', () => {
  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/platform-remediation/summary') {
        return makeJsonResponse({
          status: 'degraded',
          counts: {
            adoption: {},
            sync: {
              outdated: 0,
              syncing: 0,
              failed: 0,
              held: 0,
              rollback_available: 0,
            },
            clone: {},
          },
          workflows: {
            adoption: { available: true, state: 'ready' },
            sync: {
              available: false,
              state: 'unavailable',
              reason: 'storage_unavailable',
              detail: 'Version manifest storage is unavailable at /var/lib/map2/version_manifest_history because /var/lib/map2 is not writable.',
            },
            clone: { available: true, state: 'ready' },
          },
          manifest: {
            source_node: null,
            timestamp: null,
          },
          nodes: [
            {
              node_id: 'NODE-1',
              hostname: 'MAP2-REMOTE-1',
              visible: true,
              registered: true,
              is_online: true,
              adoption_state: 'ready',
              sync_states: [],
              clone_states: [],
              is_source_of_truth: false,
              rollback_available: false,
              version: '1.2.3',
            },
          ],
        })
      }
      if (url === '/api/platform-remediation/sync/history') {
        return makeJsonResponse({
          status: 'degraded',
          available: false,
          reason: 'storage_unavailable',
          detail: 'Version manifest storage is unavailable at /var/lib/map2/version_manifest_history because /var/lib/map2 is not writable.',
          items: [],
        })
      }
      if (url === '/api/adoption/candidates') {
        return makeJsonResponse({ items: [] })
      }
      return makeJsonResponse({})
    }) as typeof fetch
  })

  afterEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  })

  it('renders the adoption workflow for a degraded summary without showing the top-level error banner', async () => {
    renderWorkflow({ mode: 'adoption' })

    expect(await screen.findByText('Adoption route workflow')).toBeInTheDocument()
    expect(screen.queryByText('Remediation status unavailable')).not.toBeInTheDocument()
  })

  it('shows the sync unavailable card and disables sync controls', async () => {
    renderWorkflow({ mode: 'sync' })

    expect(await screen.findByText('Release sync unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rollback to release' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fix' })).toBeDisabled()
  })
})
