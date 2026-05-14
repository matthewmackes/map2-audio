// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// pivot-13b cycle 4 / Pick-3 of the eleventh-run handoff — column
// toggles + sort filter on DevicePeakMetersOverview.

import '@testing-library/jest-dom'

import { fireEvent, render, screen, within } from '@testing-library/react'

import { DevicePeakMetersOverview } from './DevicePeakMetersOverview'

const mockPolling = jest.fn()
const mockStream = jest.fn()

jest.mock('../../../hooks/useDevicesPeakMetersRegistry', () => ({
  useDevicesPeakMetersRegistry: () => mockPolling(),
}))
jest.mock('../../../hooks/useDevicesPeakMetersStream', () => ({
  useDevicesPeakMetersStream: () => mockStream(),
}))

const TWO_DEVICES = [
  {
    device_id: 'edirol-ua-1000',
    input_channels: 10,
    output_channels: 10,
    has_engine_source: false,
  },
  {
    device_id: 'tascam-us144mkii',
    input_channels: 4,
    output_channels: 4,
    has_engine_source: true,
  },
]

beforeEach(() => {
  mockPolling.mockReturnValue({
    devices: TWO_DEVICES,
    isError: false,
    isLoading: false,
  })
  mockStream.mockReturnValue({
    devices: [],
    hasFirstFrame: true,
    isConnected: false,
    lastError: null,
  })
})

describe('DevicePeakMetersOverview controls', () => {
  it('does not render the controls row unless showControls is set', () => {
    render(<DevicePeakMetersOverview />)
    expect(
      screen.queryByTestId('device-peak-meters-overview-controls'),
    ).not.toBeInTheDocument()
  })

  it('renders the controls row with showControls', () => {
    render(<DevicePeakMetersOverview showControls />)
    expect(
      screen.getByTestId('device-peak-meters-overview-controls'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('device-peak-meters-overview-toggle-split'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('device-peak-meters-overview-sort'),
    ).toBeInTheDocument()
  })

  it('toggles between combined and split channel columns', () => {
    render(<DevicePeakMetersOverview showControls />)
    // Combined by default — header shows "Channels (in/out)".
    expect(screen.getByText('Channels (in/out)')).toBeInTheDocument()
    // Click the toggle to flip to split.
    const toggle = screen.getByTestId('device-peak-meters-overview-toggle-split')
    fireEvent.click(toggle)
    expect(screen.queryByText('Channels (in/out)')).not.toBeInTheDocument()
    expect(screen.getByText('Inputs')).toBeInTheDocument()
    expect(screen.getByText('Outputs')).toBeInTheDocument()
  })

  it('sorts engine-backed devices first when sortMode=source', () => {
    render(
      <DevicePeakMetersOverview showControls initialSortMode="source" />,
    )
    const table = screen.getByTestId('device-peak-meters-overview')
    const rowTexts = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent ?? '')
    // First non-header row should be tascam (engine-backed).
    expect(rowTexts[1]).toContain('tascam-us144mkii')
    expect(rowTexts[2]).toContain('edirol-ua-1000')
  })

  it('sorts alphabetically by default', () => {
    render(<DevicePeakMetersOverview showControls />)
    const table = screen.getByTestId('device-peak-meters-overview')
    const rowTexts = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent ?? '')
    expect(rowTexts[1]).toContain('edirol-ua-1000')
    expect(rowTexts[2]).toContain('tascam-us144mkii')
  })
})
