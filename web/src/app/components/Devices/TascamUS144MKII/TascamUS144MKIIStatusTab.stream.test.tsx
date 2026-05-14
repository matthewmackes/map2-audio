// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-13h cycle 5 — Tascam StatusTab with useStreamMeter=true.

import '@testing-library/jest-dom'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'

const mockUseDeviceMeterSource = jest.fn()
const mockUseDeviceMeterSourceStream = jest.fn()

jest.mock('../../../hooks/useDeviceMeterSource', () => ({
  useDeviceMeterSource: (...args: unknown[]) =>
    mockUseDeviceMeterSource(...args),
}))

jest.mock('../../../hooks/useDeviceMeterSourceStream', () => ({
  useDeviceMeterSourceStream: (...args: unknown[]) =>
    mockUseDeviceMeterSourceStream(...args),
}))

import { TascamUS144MKIIStatusTab } from './TascamUS144MKIIStatusTab'

const STATUS_OPERATIONAL = {
  module_loaded: true,
  enumeration_stage: 'operational' as const,
  operational_path: '/sys/bus/usb/devices/1-2',
  remediation_hint: null,
  vid_pid: '0644:8020',
  boot_vid_pid: '0644:800F',
  canonical_name: 'TASCAM US-144MKII',
  tier1_sample_rate_hz: 48000,
  tier1_buffer_samples: 64,
}

function renderWithQuery(node: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  mockUseDeviceMeterSource.mockReset()
  mockUseDeviceMeterSourceStream.mockReset()
  mockUseDeviceMeterSource.mockReturnValue({
    source: undefined,
    payload: undefined,
    isError: false,
    isLoading: false,
    isStale: false,
    ageSeconds: null,
  })
  mockUseDeviceMeterSourceStream.mockReturnValue({
    source: undefined,
    payload: undefined,
    isError: false,
    isLoading: false,
    isStale: false,
    ageSeconds: null,
  })
})

describe('TascamUS144MKIIStatusTab stream mode', () => {
  it('passes enabled=true to the stream hook and enabled=false to the poll hook', () => {
    renderWithQuery(
      <TascamUS144MKIIStatusTab
        status={STATUS_OPERATIONAL}
        loading={false}
        useStreamMeter
      />,
    )
    expect(mockUseDeviceMeterSource).toHaveBeenCalled()
    expect(mockUseDeviceMeterSourceStream).toHaveBeenCalled()
    const polledArgs = mockUseDeviceMeterSource.mock.calls[0]
    const streamedArgs = mockUseDeviceMeterSourceStream.mock.calls[0]
    expect(polledArgs[0]).toBe('tascam-us144mkii')
    expect((polledArgs[1] as { enabled?: boolean })?.enabled).toBe(false)
    expect(streamedArgs[0]).toBe('tascam-us144mkii')
    expect((streamedArgs[1] as { enabled?: boolean })?.enabled).toBe(true)
  })

  it('renders the stream source instead of the polled source', () => {
    mockUseDeviceMeterSourceStream.mockReturnValue({
      source: 'engine',
      payload: {
        device_id: 'tascam-us144mkii',
        input_peak_db: [-12],
        output_peak_db: [-9],
        source: 'engine',
        captured_at: Date.now() / 1000,
      },
      isError: false,
      isLoading: false,
      isStale: false,
      ageSeconds: 1,
    })
    // Polled hook returns a *different* source to prove the stream
    // path wins.
    mockUseDeviceMeterSource.mockReturnValue({
      source: 'placeholder',
      payload: undefined,
      isError: false,
      isLoading: false,
      isStale: false,
      ageSeconds: null,
    })
    renderWithQuery(
      <TascamUS144MKIIStatusTab
        status={STATUS_OPERATIONAL}
        loading={false}
        useStreamMeter
      />,
    )
    expect(screen.getByTestId('tascam-status-meter-source')).toHaveTextContent(
      'Live',
    )
  })

  it('default mode (useStreamMeter omitted) reads from the polled hook', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: 'engine',
      payload: {
        device_id: 'tascam-us144mkii',
        input_peak_db: [-12],
        output_peak_db: [-9],
        source: 'engine',
        captured_at: Date.now() / 1000,
      },
      isError: false,
      isLoading: false,
      isStale: false,
      ageSeconds: 1,
    })
    // Stream hook returns placeholder to prove polled wins by default.
    mockUseDeviceMeterSourceStream.mockReturnValue({
      source: 'placeholder',
      payload: undefined,
      isError: false,
      isLoading: false,
      isStale: false,
      ageSeconds: null,
    })
    renderWithQuery(
      <TascamUS144MKIIStatusTab
        status={STATUS_OPERATIONAL}
        loading={false}
      />,
    )
    expect(screen.getByTestId('tascam-status-meter-source')).toHaveTextContent(
      'Live',
    )
  })
})
