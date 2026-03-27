import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Layouts/EQCategoryLayout', () => ({
  EQCategoryLayout: ({ bands, outputGain, onBypassToggle }: any) => (
    <section aria-label="eq-card-layout">
      <button type="button" onClick={() => bands[0].frequency.onChange(777)}>
        Set Band 1 Frequency
      </button>
      <button type="button" onClick={() => outputGain.onChange(3.5)}>
        Set Output Gain
      </button>
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

jest.mock('../../Visualizations/EQCurveDisplay', () => ({
  EQCurveDisplay: () => <div>EQ Curve</div>,
}))

import { ParametricEQCard } from './ParametricEQCard'

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

function makeEqParameters() {
  return {
    bands: Array.from({ length: 8 }, (_, index) => ({
      type: 'peak',
      frequency: 100 * (index + 1),
      gain: 0,
      q: 1,
      enabled: true,
    })),
    output_gain: 0,
    bypass: false,
  }
}

function makePlugin(instanceId?: number) {
  return {
    uri: 'map2://juce/eq/parametric',
    name: 'Parametric EQ',
    author: 'MAP2',
    category: 'EQ',
    class_label: 'EQ',
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

describe('ParametricEQCard runtime identity', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (method === 'PATCH') {
        return jsonResponse({ status: 'ok', parameters: makeEqParameters() })
      }

      if (url.includes('/api/engine/eq/parameters')) {
        return jsonResponse(makeEqParameters())
      }

      if (url.includes('/api/engine/eq/frequency-response/default')) {
        return jsonResponse({
          frequencies: [20, 1000, 20000],
          response: [0, 1, 0],
        })
      }

      return new Response('not found', { status: 404 })
    }) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('scopes EQ reads and writes by instance_id and plugin_position', async () => {
    renderCard(
      <ParametricEQCard
        plugin={makePlugin(202) as any}
        pluginPosition={5}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#4ecdc4"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/eq/parameters?instance_id=202&plugin_position=5'
        )),
      ).toBe(true)
    })
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) => (
        url === '/api/engine/eq/frequency-response/default?instance_id=202&plugin_position=5'
      )),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Set Band 1 Frequency' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/eq/bands/0?instance_id=202&plugin_position=5'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ frequency: 777 })
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Output Gain' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/eq?instance_id=202&plugin_position=5'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ output_gain: 3.5 })
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Bypass' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/eq?instance_id=202&plugin_position=5'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ bypass: true })
        )),
      ).toBe(true)
    })
  })

  it('falls back to plugin_position when the plugin has no instance_id yet', async () => {
    renderCard(
      <ParametricEQCard
        plugin={makePlugin() as any}
        pluginPosition={7}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#4ecdc4"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/eq/parameters?plugin_position=7'
        )),
      ).toBe(true)
    })
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) => (
        url === '/api/engine/eq/frequency-response/default?plugin_position=7'
      )),
    ).toBe(true)
  })
})
