// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Tenth Continue run — RTL coverage for the StatusTab metering-source row.
// Covers the three states surfaced by the structured list:
//   - placeholder source → warm-gray "Awaiting engine wire-up" Tag
//   - engine source     → green "Live" Tag
//   - /meters error     → red "Endpoint unavailable" Tag

import '@testing-library/jest-dom'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

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

function mockFetchOnce(payload: unknown, status = 200) {
  // @ts-expect-error jsdom fetch shim
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }))
}

describe('TascamUS144MKIIStatusTab — metering source row', () => {
  beforeEach(() => {
    // @ts-expect-error jsdom
    global.fetch = undefined
  })

  it('renders the static StructuredList rows from props', () => {
    mockFetchOnce({ source: 'placeholder' })
    renderWithQuery(<TascamUS144MKIIStatusTab status={STATUS_OPERATIONAL} loading={false} />)
    expect(screen.getByText('TASCAM US-144MKII')).toBeInTheDocument()
    expect(screen.getByText('0644:8020')).toBeInTheDocument()
    expect(screen.getByText('Metering source')).toBeInTheDocument()
  })

  it('shows the warm-gray "Awaiting engine wire-up" Tag when source is placeholder', async () => {
    mockFetchOnce({ source: 'placeholder' })
    renderWithQuery(<TascamUS144MKIIStatusTab status={STATUS_OPERATIONAL} loading={false} />)
    await waitFor(() => {
      expect(screen.getByTestId('tascam-status-meter-source')).toHaveTextContent(
        'Awaiting engine wire-up',
      )
    })
    expect(
      screen.getByTestId('tascam-status-meter-source').classList.contains('cds--tag--warm-gray'),
    ).toBe(true)
  })

  it('shows the green "Live" Tag when source is engine', async () => {
    mockFetchOnce({ source: 'engine' })
    renderWithQuery(<TascamUS144MKIIStatusTab status={STATUS_OPERATIONAL} loading={false} />)
    await waitFor(() => {
      expect(screen.getByTestId('tascam-status-meter-source')).toHaveTextContent('Live')
    })
    expect(
      screen.getByTestId('tascam-status-meter-source').classList.contains('cds--tag--green'),
    ).toBe(true)
  })

  it('shows the red "Endpoint unavailable" Tag when the /meters route 5xxs', async () => {
    mockFetchOnce({}, 500)
    renderWithQuery(<TascamUS144MKIIStatusTab status={STATUS_OPERATIONAL} loading={false} />)
    await waitFor(() => {
      expect(screen.getByTestId('tascam-status-meter-source')).toHaveTextContent(
        'Endpoint unavailable',
      )
    })
    expect(
      screen.getByTestId('tascam-status-meter-source').classList.contains('cds--tag--red'),
    ).toBe(true)
  })

  it('disables the Reset USB button while status prop is missing', () => {
    mockFetchOnce({ source: 'placeholder' })
    renderWithQuery(<TascamUS144MKIIStatusTab status={undefined} loading={false} />)
    const btn = screen.getByRole('button', { name: /Reset USB port/i })
    expect(btn).toBeDisabled()
  })
})
