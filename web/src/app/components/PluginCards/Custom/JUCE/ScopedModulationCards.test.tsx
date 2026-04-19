import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Layouts/ModulationCategoryLayout', () => ({
  ModulationCategoryLayout: ({ rate, onBypassToggle }: any) => (
    <section aria-label="modulation-layout">
      {rate && (
        <button type="button" onClick={() => rate.onChange(2.5)}>
          Set Rate
        </button>
      )}
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

jest.mock('../../Layouts/PitchCategoryLayout', () => ({
  PitchCategoryLayout: ({ semitones, feedback, onBypassToggle }: any) => (
    <section aria-label="pitch-layout">
      {semitones && (
        <button type="button" onClick={() => semitones.onChange(7)}>
          Set Semitones
        </button>
      )}
      {feedback && (
        <button type="button" onClick={() => feedback.onChange(35)}>
          Set Feedback
        </button>
      )}
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

import { BossXS1Card } from './BossXS1Card'
import { ChorusCard } from './ChorusCard'
import { IntervalShifterCard } from './IntervalShifterCard'

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

function renderCard(ui: React.ReactElement) {
  const queryClient = makeClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

function makePlugin(uri: string, instanceId?: number) {
  return {
    uri,
    name: 'Scoped Plugin',
    author: 'MAP2',
    category: 'Modulation',
    class_label: 'Modulation',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
    ...(typeof instanceId === 'number' ? { instance_id: instanceId } : {}),
  }
}

function makeChorusState() {
  return {
    parameters: {
      rate: 1.2,
      depth: 60,
      centre_delay: 9,
      feedback: 10,
      mix: 50,
      spread: 90,
      bypass: false,
    },
    metering: {
      input_level: -12.0,
      output_level: -6.0,
      lfo_phase: 0.2,
    },
  }
}

function makeIntervalState() {
  return {
    parameters: {
      pitch_l: 300,
      pitch_r: -400,
      delay_l: 0,
      delay_r: 0,
      feedback: 0,
      mix: 45,
      spread: 100,
      preset: 0,
      bypass: false,
    },
    metering: {
      input_level_l: -14.0,
      input_level_r: -15.0,
      output_level_l: -11.0,
      output_level_r: -12.0,
      grain_phase: 0.0,
    },
  }
}

function makeBossState() {
  return {
    parameters: {
      shift_amount: -2,
      balance: 55,
      detune_mode: false,
      detune_amount: 10,
      glide: 12,
      feedback: 0.2,
      pedal_enabled: false,
      pedal_position: 0,
      pedal_min: -7,
      pedal_max: 7,
      preset: 0,
      bypass: false,
    },
    metering: {
      input_level: -10.0,
      output_level: -7.0,
    },
  }
}

describe('Selected-block modulation card scoping', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/api/engine/modulation/chorus')) {
        if (method === 'PATCH') {
          return jsonResponse({ status: 'ok', parameters: makeChorusState().parameters })
        }
        return jsonResponse(makeChorusState())
      }

      if (url.includes('/api/engine/modulation/pitch-shifter')) {
        if (method === 'PATCH') {
          return jsonResponse({ status: 'ok', parameters: makeIntervalState().parameters })
        }
        return jsonResponse(makeIntervalState())
      }

      if (url.includes('/api/engine/pitch/boss-xs1')) {
        if (method === 'PATCH') {
          return jsonResponse({ status: 'ok', parameters: makeBossState().parameters })
        }
        return jsonResponse(makeBossState())
      }

      return new Response('not found', { status: 404 })
    }) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('scopes chorus reads and writes by runtime identity', async () => {
    renderCard(
      <ChorusCard
        plugin={makePlugin('map2://juce/modulation/chorus', 303) as any}
        pluginPosition={6}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#9b59b6"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/modulation/chorus?instance_id=303&plugin_position=6'
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Rate' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/modulation/chorus/parameters?instance_id=303&plugin_position=6'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ rate: 2.5 })
        )),
      ).toBe(true)
    })
  })

  it('scopes interval shifter requests and carries plugin_uri through the shared pitch-shifter route', async () => {
    const encodedIntervalUri = encodeURIComponent('map2://juce/pitch/interval')

    renderCard(
      <IntervalShifterCard
        plugin={makePlugin('map2://juce/pitch/interval', 707) as any}
        pluginPosition={4}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#8b5cf6"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === `/api/engine/modulation/pitch-shifter?instance_id=707&plugin_position=4&plugin_uri=${encodedIntervalUri}`
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Semitones' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === `/api/engine/modulation/pitch-shifter/parameters?instance_id=707&plugin_position=4&plugin_uri=${encodedIntervalUri}`
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ pitch_l: 700, pitch_r: 700, delay_l: 0, delay_r: 0, feedback: 0 })
        )),
      ).toBe(true)
    })
  })

  it('falls back to plugin_position for Boss XS-1 when instance_id is not available yet', async () => {
    renderCard(
      <BossXS1Card
        plugin={makePlugin('map2://juce/pitch/boss-xs1') as any}
        pluginPosition={2}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#ff6600"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/pitch/boss-xs1?plugin_position=2'
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Feedback' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/pitch/boss-xs1/parameters?plugin_position=2'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ feedback: 0.35 })
        )),
      ).toBe(true)
    })
  })
})
