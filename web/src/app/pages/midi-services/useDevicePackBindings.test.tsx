/**
 * T2482 loop 11 / iter 108 — useDevicePackBindings rollup tests.
 *
 * Tests the pure rollUpByProfile logic by exercising the hook's
 * computed `rows` output against synthetic binding records. The
 * fetch path is mocked at the global `fetch` level.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { useDevicePackBindings } from './useDevicePackBindings'

interface BindingShape {
  binding_id: string
  consumer_type: string
  consumer_id: string
  source_type: string
  target_type: string
  device_id: string | null
  scope: string
  scope_id: string | null
  enabled: boolean
}

function makeBinding(overrides: Partial<BindingShape> = {}): BindingShape {
  return {
    binding_id: 'b1',
    consumer_type: 'device_pack',
    consumer_id: 'native-instruments/maschine-mk1.midi',
    source_type: 'midi_cc',
    target_type: 'engine_param',
    device_id: null,
    scope: 'global',
    scope_id: null,
    enabled: true,
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe('useDevicePackBindings', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeEach(() => {
    originalFetch = globalThis.fetch
    const payload = [
      makeBinding({ binding_id: 'b1', consumer_id: 'native-instruments/maschine-mk1.midi', enabled: true }),
      makeBinding({ binding_id: 'b2', consumer_id: 'native-instruments/maschine-mk1.midi', enabled: false }),
      makeBinding({ binding_id: 'b3', consumer_id: 'mackie/mcu.midi', enabled: true }),
      makeBinding({ binding_id: 'b4', consumer_id: 'novation/launch-control-xl.midi', enabled: false }),
    ]
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response),
    ) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch
    }
  })

  it('rolls up bindings by consumer_id', async () => {
    const { result } = renderHook(() => useDevicePackBindings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toHaveLength(3)
    const profiles = result.current.rows.map((r) => r.profileKey).sort()
    expect(profiles).toEqual([
      'mackie/mcu.midi',
      'native-instruments/maschine-mk1.midi',
      'novation/launch-control-xl.midi',
    ])
  })

  it('counts bindings per profile', async () => {
    const { result } = renderHook(() => useDevicePackBindings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const maschine = result.current.rows.find((r) => r.profileKey === 'native-instruments/maschine-mk1.midi')
    expect(maschine?.bindingCount).toBe(2)
  })

  it('marks enabled when ANY row in the group is enabled', async () => {
    const { result } = renderHook(() => useDevicePackBindings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const maschine = result.current.rows.find((r) => r.profileKey === 'native-instruments/maschine-mk1.midi')
    // b1 enabled=true, b2 enabled=false → group is enabled
    expect(maschine?.enabled).toBe(true)
    const launchControl = result.current.rows.find((r) => r.profileKey === 'novation/launch-control-xl.midi')
    // b4 only, enabled=false → group is disabled
    expect(launchControl?.enabled).toBe(false)
  })

  it('splits vendor + profile from consumer_id', async () => {
    const { result } = renderHook(() => useDevicePackBindings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const maschine = result.current.rows.find((r) => r.profileKey === 'native-instruments/maschine-mk1.midi')
    expect(maschine?.vendor).toBe('native-instruments')
    expect(maschine?.profile).toBe('maschine-mk1.midi')
  })
})
