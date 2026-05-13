// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 + T2515-Follow-up-METER-WIRE — RTL coverage for the metering tab.
// Mocks global fetch so the tab can exercise both the placeholder source
// path (default) and the engine source path without a backend.

import '@testing-library/jest-dom'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

import { TascamUS144MKIIMeteringTab } from './TascamUS144MKIIMeteringTab'

const CAPABILITIES = {
  name: 'TASCAM US-144MKII',
  manufacturer: 'TASCAM',
  kernel_module: 'snd-usb-us144mkii',
  input_channels: 4,
  output_channels: 4,
  format: 'S24_3LE',
  sample_rate: 48000,
  buffer_size: 64,
  analog_send_channels: [0, 1],
  analog_return_channels: [0, 1],
  spdif_send_channels: [2, 3],
  spdif_return_channels: [2, 3],
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

describe('TascamUS144MKIIMeteringTab', () => {
  beforeEach(() => {
    // Reset fetch between tests so a previous mock doesn't bleed across.
    // @ts-expect-error jsdom
    global.fetch = undefined
  })

  it('renders the loading state until capabilities prop arrives', () => {
    mockFetchOnce({
      input_peak_db: [-150, -150, -150, -150],
      output_peak_db: [-150, -150, -150, -150],
      source: 'placeholder',
    })
    renderWithQuery(<TascamUS144MKIIMeteringTab />)
    expect(screen.getByText(/Loading device profile/i)).toBeInTheDocument()
  })

  it('renders the placeholder Tag + em-dash readouts when source is placeholder', async () => {
    mockFetchOnce({
      input_peak_db: [-150, -150, -150, -150],
      output_peak_db: [-150, -150, -150, -150],
      source: 'placeholder',
    })
    renderWithQuery(<TascamUS144MKIIMeteringTab capabilities={CAPABILITIES} />)
    await waitFor(() => {
      expect(
        screen.getByTestId('tascam-meters-source-tag'),
      ).toHaveTextContent('Awaiting engine wire-up')
    })
    // Every row should render the em-dash sentinel (no "-150" text).
    expect(screen.getByTestId('tascam-meter-in-0').textContent).toContain('—')
    expect(screen.getByTestId('tascam-meter-in-0').textContent).not.toContain('-150')
    expect(screen.getByTestId('tascam-meter-out-2').textContent).toContain('—')
  })

  it('renders Live Tag + numeric dBFS rows when source is engine', async () => {
    mockFetchOnce({
      input_peak_db: [-12.5, -18.0, -150, -150],
      output_peak_db: [-3.1, -3.1, -150, -150],
      source: 'engine',
    })
    renderWithQuery(<TascamUS144MKIIMeteringTab capabilities={CAPABILITIES} />)
    // Wait for both the source tag AND a numeric row so React Query
    // has fully flushed the fetch result through to render. Using
    // waitFor on a row-specific assertion avoids the race where the
    // tag renders ahead of the channel rows on the first pass.
    await waitFor(() => {
      expect(screen.getByTestId('tascam-meter-in-0').textContent).toContain('-12.5 dBFS')
    })
    expect(
      screen.getByTestId('tascam-meters-source-tag'),
    ).toHaveTextContent('Live')
    expect(screen.getByTestId('tascam-meter-in-1').textContent).toContain('-18.0 dBFS')
    // Silence-sentinel channels still render em-dash, even on a 'engine' source.
    expect(screen.getByTestId('tascam-meter-in-2').textContent).toContain('—')
    expect(screen.getByTestId('tascam-meter-out-0').textContent).toContain('-3.1 dBFS')
  })

  it('renders the warning notification when the route returns non-OK', async () => {
    mockFetchOnce({}, 500)
    renderWithQuery(<TascamUS144MKIIMeteringTab capabilities={CAPABILITIES} />)
    await waitFor(() => {
      expect(
        screen.getByText(/Metering endpoint unavailable/i),
      ).toBeInTheDocument()
    })
  })

  it('S/PDIF channels render with a magenta Tag, analog channels with blue', async () => {
    mockFetchOnce({
      input_peak_db: [-12.5, -18.0, -150, -150],
      output_peak_db: [-3.1, -3.1, -150, -150],
      source: 'engine',
    })
    renderWithQuery(<TascamUS144MKIIMeteringTab capabilities={CAPABILITIES} />)
    await waitFor(() => {
      expect(screen.getByTestId('tascam-meter-in-0')).toBeInTheDocument()
    })
    // Analog input ch 0 → blue Tag inside the row.
    const inAnalog = screen.getByTestId('tascam-meter-in-0')
    expect(inAnalog.querySelector('.cds--tag--blue')).not.toBeNull()
    // S/PDIF input ch 2 → magenta Tag.
    const inSpdif = screen.getByTestId('tascam-meter-in-2')
    expect(inSpdif.querySelector('.cds--tag--magenta')).not.toBeNull()
  })
})
