import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ToastProvider } from '../components/Toasts'

const mockUseOpenApiSchema = jest.fn()
let currentHookState: Record<string, unknown>

jest.mock('../hooks/useOpenApiSchema', () => ({
  useOpenApiSchema: () => mockUseOpenApiSchema(),
}))

jest.mock('./ApiObservatory/CatalogTab', () => ({
  CatalogTab: () => <div>Catalog</div>,
}))

jest.mock('./ApiObservatory/ClusterTopologyPanel', () => ({
  ClusterTopologyPanel: () => <div>Cluster Topology</div>,
}))

jest.mock('./ApiObservatory/RequestBuilderTab', () => ({
  RequestBuilderTab: () => <div>Request Builder Panel</div>,
}))

jest.mock('./ApiObservatory/WebSocketInspectorTab', () => ({
  WebSocketInspectorTab: () => <div>WebSocket Inspector Panel</div>,
}))

jest.mock('./ApiObservatory/TrafficMonitorTab', () => ({
  TrafficMonitorTab: () => (
    <div>
      <span>Waterfall</span>
      <span>Requests</span>
    </div>
  ),
}))

jest.mock('./ApiObservatory/CollectionsTab', () => ({
  CollectionsTab: () => <div>Collections</div>,
}))

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

import { ApiObservatoryPage } from './ApiObservatoryPage'

function renderPage() {
  return render(
    <ToastProvider>
      <ApiObservatoryPage />
    </ToastProvider>,
  )
}

describe('ApiObservatoryPage', () => {
  beforeEach(() => {
    mockUseOpenApiSchema.mockReset()
    mockUseOpenApiSchema.mockImplementation(() => currentHookState)

    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/peers')) {
        return {
          ok: true,
          json: async () => ({
            local_node_id: 'local-node',
            peers_discovered: 0,
            peers_connected: 0,
            peers: [],
          }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ nodes: {}, summary: {} }),
      } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('renders API observatory shell with tab navigation', async () => {
    currentHookState = {
      schema: {
        paths: {
          '/api/audio/status': {},
        },
      },
      catalog: [
        {
          tag: 'Audio',
          endpoints: [
            {
              id: 'GET /api/audio/status',
              tag: 'Audio',
              method: 'get',
              path: '/api/audio/status',
              summary: 'Get audio status',
              description: 'Returns engine state',
              parameters: [],
              requestBody: null,
              responses: [],
              security: [],
              diffStatus: null,
            },
          ],
        },
      ],
      loading: false,
      error: null,
      lastUpdated: '2026-03-11T17:00:00.000Z',
      diff: { added: [], removed: [], modified: [] },
      refresh: jest.fn(),
    }

    renderPage()

    expect(screen.getByRole('heading', { name: 'API Observatory' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'API Catalog' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request Builder' })).toBeTruthy()
    expect(screen.getByText('OpenAPI-driven endpoint explorer with hand-authored context and schema diffs.')).toBeTruthy()

    await waitFor(() => expect(screen.getByText('Cluster Topology')).toBeTruthy())
  })

  it('shows schema diff banner and schema-change toast', async () => {
    const refresh = jest.fn()

    currentHookState = {
      schema: {
        paths: {
          '/api/audio/status': {},
        },
      },
      catalog: [
        {
          tag: 'Audio',
          endpoints: [
            {
              id: 'GET /api/audio/status',
              tag: 'Audio',
              method: 'get',
              path: '/api/audio/status',
              summary: 'Get audio status',
              description: '',
              parameters: [],
              requestBody: null,
              responses: [],
              security: [],
              diffStatus: 'modified',
            },
          ],
        },
      ],
      loading: false,
      error: null,
      lastUpdated: '2026-03-11T17:05:00.000Z',
      diff: { added: ['/api/system/info'], removed: [], modified: ['/api/audio/status'] },
      refresh,
    }

    renderPage()

    expect(screen.getByText(/Schema diff: \+1 \/ ~1 \/ -0/i)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Schema changed: 2 path updates detected')).toBeTruthy())
  })

  it('switches to traffic monitor tab', () => {
    currentHookState = {
      schema: null,
      catalog: [],
      loading: false,
      error: null,
      lastUpdated: null,
      diff: { added: [], removed: [], modified: [] },
      refresh: jest.fn(),
    }

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Traffic Monitor' }))

    expect(screen.getByText('Waterfall')).toBeTruthy()
    expect(screen.getByText('Requests')).toBeTruthy()
  })
})
