// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { DevicePeakMetersOverview } from './DevicePeakMetersOverview'

const mockUseDevicesPeakMetersRegistry = jest.fn()

jest.mock('../../../hooks/useDevicesPeakMetersRegistry', () => ({
  useDevicesPeakMetersRegistry: () => mockUseDevicesPeakMetersRegistry(),
}))

describe('DevicePeakMetersOverview', () => {
  beforeEach(() => {
    mockUseDevicesPeakMetersRegistry.mockReset()
  })

  it('renders one row per registered device', () => {
    mockUseDevicesPeakMetersRegistry.mockReturnValue({
      devices: [
        { device_id: 'edirol-ua-1000', input_channels: 10, output_channels: 10, has_engine_source: false },
        { device_id: 'tascam-us144mkii', input_channels: 4, output_channels: 4, has_engine_source: true },
      ],
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersOverview />)
    expect(screen.getByTestId('device-peak-meters-overview')).toBeInTheDocument()
    expect(screen.getByText('edirol-ua-1000')).toBeInTheDocument()
    expect(screen.getByText('tascam-us144mkii')).toBeInTheDocument()
    expect(screen.getByText('10 / 10')).toBeInTheDocument()
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
  })

  it('renders the green Live tag for engine-backed devices and warm-gray for placeholder', () => {
    mockUseDevicesPeakMetersRegistry.mockReturnValue({
      devices: [
        { device_id: 'a', input_channels: 2, output_channels: 2, has_engine_source: true },
        { device_id: 'b', input_channels: 2, output_channels: 2, has_engine_source: false },
      ],
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersOverview />)
    const liveTags = screen.getAllByTestId('overview-source-engine')
    const placeholderTags = screen.getAllByTestId('overview-source-placeholder')
    expect(liveTags).toHaveLength(1)
    expect(placeholderTags).toHaveLength(1)
    expect(liveTags[0]).toHaveTextContent('Live')
    expect(placeholderTags[0]).toHaveTextContent('Awaiting engine wire-up')
  })

  it('renders the error state when the registry route fails', () => {
    mockUseDevicesPeakMetersRegistry.mockReturnValue({
      devices: [],
      isError: true,
      isLoading: false,
    })
    render(<DevicePeakMetersOverview />)
    expect(screen.getByTestId('device-peak-meters-overview-error')).toBeInTheDocument()
    expect(screen.getByText('Endpoint unavailable')).toBeInTheDocument()
  })

  it('renders the loading state while the first fetch is in flight', () => {
    mockUseDevicesPeakMetersRegistry.mockReturnValue({
      devices: [],
      isError: false,
      isLoading: true,
    })
    render(<DevicePeakMetersOverview />)
    expect(screen.getByTestId('device-peak-meters-overview-loading')).toBeInTheDocument()
  })

  it('renders the optional title above the table', () => {
    mockUseDevicesPeakMetersRegistry.mockReturnValue({
      devices: [
        { device_id: 'a', input_channels: 2, output_channels: 2, has_engine_source: false },
      ],
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersOverview title="Per-device metering" />)
    expect(screen.getByText('Per-device metering')).toBeInTheDocument()
  })
})
