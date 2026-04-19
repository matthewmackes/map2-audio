import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Layouts/DynamicsCategoryLayout', () => ({
  DynamicsCategoryLayout: ({ threshold, onBypassToggle }: any) => (
    <section aria-label="compressor-card-layout">
      <button type="button" onClick={() => threshold.onChange(-22)}>
        Set Threshold
      </button>
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

import { CompressorCard } from './CompressorCard'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeCompressorState() {
  return {
    parameters: {
      threshold: -12,
      ratio: 4,
      attack: 10,
      release: 100,
      knee: 6,
      makeup_gain: 0,
      auto_makeup: false,
      bypass: false,
    },
    metering: {
      input_level: -12.5,
      output_level: -6.1,
      gain_reduction: 2.2,
      input_rms: -13.0,
      output_rms: -6.5,
    },
  }
}

function makePlugin(instanceId?: number) {
  return {
    uri: 'map2://juce/dynamics/compressor',
    name: 'Compressor',
    author: 'MAP2',
    category: 'Dynamics',
    class_label: 'Dynamics',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
    ...(typeof instanceId === 'number' ? { instance_id: instanceId } : {}),
  }
}

function renderCard(ui: React.ReactElement) {
  const queryClient = makeClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

describe('CompressorCard runtime identity', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/api/engine/dynamics/limiter') || url.includes('/api/engine/dynamics/gate')) {
        return new Response('unexpected', { status: 500 })
      }

      if (method === 'PATCH') {
        return jsonResponse({ status: 'ok', parameters: makeCompressorState().parameters })
      }

      if (url.includes('/api/engine/dynamics/compressor')) {
        return jsonResponse(makeCompressorState())
      }

      return new Response('not found', { status: 404 })
    }) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('scopes compressor reads and writes by instance_id and plugin_position without querying other processors', async () => {
    renderCard(
      <CompressorCard
        plugin={makePlugin(202) as any}
        pluginPosition={5}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#22c55e"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/dynamics/compressor?instance_id=202&plugin_position=5'
        )),
      ).toBe(true)
    })
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes('/api/engine/dynamics/limiter')),
    ).toBe(false)
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes('/api/engine/dynamics/gate')),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Set Threshold' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/dynamics/compressor?instance_id=202&plugin_position=5'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ threshold: -22 })
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Bypass' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/dynamics/compressor?instance_id=202&plugin_position=5'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ bypass: true })
        )),
      ).toBe(true)
    })
  })

  it('falls back to plugin_position when the compressor has no instance_id yet', async () => {
    renderCard(
      <CompressorCard
        plugin={makePlugin() as any}
        pluginPosition={7}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#22c55e"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/dynamics/compressor?plugin_position=7'
        )),
      ).toBe(true)
    })
  })
})
