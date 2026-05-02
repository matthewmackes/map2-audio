/**
 * T2483 loop 16 / iter 159 — useMidiServicesShellWindow tests.
 *
 * Confirms the helper produces the right shell-window patch.
 */

import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'
import React from 'react'

import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'

interface CapturedPatch {
  subtitle: string
  kicker: string
}

const capturedPatches: CapturedPatch[] = []
const clearCalls = { count: 0 }

jest.mock('../../layout/useSetShellWindow', () => ({
  useSetShellWindow: (patch: CapturedPatch) => {
    // capture each call so the test asserts on it
    capturedPatches.push(patch)
    return undefined
  },
}))

beforeEach(() => {
  capturedPatches.length = 0
  clearCalls.count = 0
})

describe('useMidiServicesShellWindow', () => {
  it('produces a Platform / MIDI Services / {region} kicker', () => {
    renderHook(() => useMidiServicesShellWindow('Network', 'subtitle text'))
    expect(capturedPatches).toHaveLength(1)
    expect(capturedPatches[0].kicker).toBe('Platform / MIDI Services / Network')
  })

  it('forwards the subtitle prop verbatim', () => {
    renderHook(() => useMidiServicesShellWindow('Lab', 'AI mapping suggestions'))
    expect(capturedPatches[0].subtitle).toBe('AI mapping suggestions')
  })

  it.each(['Network', 'Presets', 'Events', 'Processing', 'Lab', 'Transport', 'Connections'])(
    'produces correct kicker for %s region',
    (region) => {
      renderHook(() => useMidiServicesShellWindow(region, 'sub'))
      expect(capturedPatches[0].kicker).toBe(`Platform / MIDI Services / ${region}`)
    },
  )
})
