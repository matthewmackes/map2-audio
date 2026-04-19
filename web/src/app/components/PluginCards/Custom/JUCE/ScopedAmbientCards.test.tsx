import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Layouts/PitchCategoryLayout', () => ({
  PitchCategoryLayout: ({ semitones, onBypassToggle }: any) => (
    <section aria-label="pitch-layout">
      {semitones && (
        <button type="button" onClick={() => semitones.onChange(700)}>
          Set Pitch L
        </button>
      )}
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

jest.mock('../../Layouts/ReverbCategoryLayout', () => ({
  ReverbCategoryLayout: ({ preDelay, onBypassToggle }: any) => (
    <section aria-label="reverb-layout">
      {preDelay && (
        <button type="button" onClick={() => preDelay.onChange(120)}>
          Set Pre-Delay
        </button>
      )}
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
    </section>
  ),
}))

jest.mock('../../Layouts/MultiEffectCategoryLayout', () => ({
  MultiEffectCategoryLayout: ({ inputGain, onBypassToggle, presets }: any) => (
    <section aria-label="multi-effect-layout">
      {inputGain && (
        <button type="button" onClick={() => inputGain.onChange(66)}>
          Set Atmosphere
        </button>
      )}
      <button type="button" onClick={() => onBypassToggle?.()}>
        Toggle Bypass
      </button>
      {presets}
    </section>
  ),
}))

import { H3000Card } from './H3000Card'
import { LexiLoveCard } from './LexiLoveCard'
import { ShoeGazeCard } from './ShoeGazeCard'

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
    name: 'Scoped Ambient Plugin',
    author: 'MAP2',
    category: 'Ambient',
    class_label: 'Ambient',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
    ...(typeof instanceId === 'number' ? { instance_id: instanceId } : {}),
  }
}

function makeH3000State() {
  return {
    parameters: {
      algorithm_index: 3,
      algorithm: 'stereo_shift',
      pitch_l: 700,
      pitch_r: -900,
      delay_l: 40,
      delay_r: 55,
      feedback: 18,
      cross_feedback: 22,
      mod_depth: 35,
      mod_rate: 0.9,
      low_cut: 120,
      high_cut: 9000,
      mix: 48,
      level_l: 92,
      level_r: 88,
      glide: 14,
      bypass: false,
    },
    metering: {
      input_level_l: -11,
      input_level_r: -12,
      output_level_l: -9,
      output_level_r: -10,
      pitch_l_actual: 700,
      pitch_r_actual: -900,
      delay_l_actual: 40,
      delay_r_actual: 55,
      mod_phase: 0.2,
    },
  }
}

function makeLexiState() {
  return {
    parameters: {
      algorithm_index: 1,
      algorithm: 'rich_plate',
      pre_delay: 55,
      decay_time: 3.5,
      diffusion: 82,
      low_decay_mult: 1.1,
      high_decay_mult: 0.9,
      low_crossover: 450,
      high_crossover: 8000,
      early_level: 62,
      early_pattern: 58,
      mod_depth: 12,
      mod_rate: 0.7,
      mix: 38,
      high_cut: 11000,
      low_cut: 45,
      spillover: true,
      bypass: false,
    },
    metering: {
      input_level_l: -12,
      input_level_r: -13,
      output_level_l: -10,
      output_level_r: -11,
      reverb_level_l: -9,
      reverb_level_r: -9,
      early_level: -8,
      late_level: -10,
      mod_lfo_phase: 0.1,
      current_decay: 3.5,
    },
  }
}

function makeShoeGazeState() {
  return {
    parameters: {
      atmosphere: 55,
      decay: 4.5,
      shimmer: 20,
      shimmer_pitch: 12,
      modulation: 32,
      mod_rate: 0.7,
      drive: 18,
      delay_time: 210,
      delay_feedback: 28,
      delay_mod: 22,
      low_cut: 90,
      high_cut: 7500,
      mix: 52,
      stereo_width: 150,
      reverb_diffusion: 85,
      reverb_damping: 40,
      shimmer_feedback: 35,
      chorus_voices: 4,
      ducking: 20,
      preset: 'manual',
      spillover: true,
      bypass: false,
    },
    metering: {
      input_level: -10,
      output_level: -8,
      reverb_level: -12,
      shimmer_level: -15,
      lfo_phase: 0.2,
      grain_activity: 0.3,
      ducking_reduction: 4,
      feedback_level: -14,
      saturation_level: 0.2,
      stereo_correlation: 0.8,
      cpu_load: 2.5,
    },
  }
}

describe('Selected-block ambient card scoping', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/api/engine/h3000')) {
        if (method === 'PATCH') {
          return jsonResponse({ status: 'ok', parameters: makeH3000State().parameters })
        }
        return jsonResponse(makeH3000State())
      }

      if (url.includes('/api/engine/lexilove')) {
        if (method === 'PATCH') {
          return jsonResponse({ status: 'ok', parameters: makeLexiState().parameters })
        }
        return jsonResponse(makeLexiState())
      }

      if (url.includes('/api/engine/shoegaze')) {
        if (method === 'PATCH' || method === 'POST') {
          return jsonResponse({ status: 'ok', parameters: makeShoeGazeState().parameters })
        }
        return jsonResponse(makeShoeGazeState())
      }

      return new Response('not found', { status: 404 })
    }) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('scopes H3000 reads and writes by runtime identity', async () => {
    renderCard(
      <H3000Card
        plugin={makePlugin('map2://juce/pitch/h3000', 901) as any}
        pluginPosition={0}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#00aaff"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/h3000?instance_id=901&plugin_position=0'
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Pitch L' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/h3000/parameters?instance_id=901&plugin_position=0'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ pitch_l: 700 })
        )),
      ).toBe(true)
    })
  })

  it('falls back to plugin_position for Lexi Love when instance_id is not available yet', async () => {
    renderCard(
      <LexiLoveCard
        plugin={makePlugin('map2://juce/reverb/pcm70') as any}
        pluginPosition={3}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#00cc00"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/lexilove?plugin_position=3'
        )),
      ).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set Pre-Delay' }))
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/lexilove/parameters?plugin_position=3'
          && init?.method === 'PATCH'
          && init?.body === JSON.stringify({ pre_delay: 120 })
        )),
      ).toBe(true)
    })
  })

  it('scopes ShoeGaze preset changes to the selected runtime instance', async () => {
    renderCard(
      <ShoeGazeCard
        plugin={makePlugin('map2://juce/multieffect/shoegaze', 903) as any}
        pluginPosition={5}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#8e44ad"
      />,
    )

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) => (
          url === '/api/engine/shoegaze?instance_id=903&plugin_position=5'
        )),
      ).toBe(true)
    })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'loveless' } })
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url, init]) => (
          url === '/api/engine/shoegaze/preset/loveless?instance_id=903&plugin_position=5'
          && init?.method === 'POST'
        )),
      ).toBe(true)
    })
  })
})
