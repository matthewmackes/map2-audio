import '@testing-library/jest-dom'

import React from 'react'
import { render, screen } from '@testing-library/react'

import { TascamUS144MKIIView } from './TascamUS144MKIIView'

const mockUseDeviceNodeContext = jest.fn()
const mockUseQuery = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}))

jest.mock('../../../hooks/useDeviceNodeContext', () => ({
  useDeviceNodeContext: (...args: unknown[]) => mockUseDeviceNodeContext(...args),
}))

jest.mock('../../../layout/useSetShellWindow', () => ({
  useSetShellWindow: () => {},
}))

jest.mock('../../DeviceContext', () => ({
  DeviceContextBanner: ({ deviceName }: { deviceName: string }) => (
    <div data-testid="device-context-banner">{deviceName} context banner</div>
  ),
}))

jest.mock('../../shared/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))

jest.mock('../../shared/LoadingState', () => ({
  LoadingState: ({ description }: { description: string }) => <div data-testid="loading-state">{description}</div>,
}))

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

const STATUS_BOOT = {
  ...STATUS_OPERATIONAL,
  enumeration_stage: 'boot_mode' as const,
  operational_path: null,
  remediation_hint: 'Unplug and replug the USB cable, or reboot.',
}

const CAPABILITIES = {
  name: 'TASCAM US-144MKII',
  manufacturer: 'TASCAM',
  kernel_module: 'snd-usb-us144mkii',
  input_channels: 4,
  output_channels: 4,
  format: 'S24_3LE',
  sample_rate: 48000,
  buffer_size: 64,
  spdif_send_channels: [2, 3],
  spdif_return_channels: [2, 3],
  analog_send_channels: [0, 1],
  analog_return_channels: [0, 1],
}

function setupQueries(status: typeof STATUS_OPERATIONAL | typeof STATUS_BOOT | null) {
  mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[1]
    if (key === 'status') {
      return { data: status, isLoading: status === null, isError: false }
    }
    if (key === 'capabilities') {
      return { data: CAPABILITIES, isLoading: false, isError: false }
    }
    return { data: null, isLoading: false, isError: true }
  })
}

describe('TascamUS144MKIIView', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockUseDeviceNodeContext.mockReset()
  })

  it('renders the context banner and tab list when the device is ready', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'ready' })
    setupQueries(STATUS_OPERATIONAL)
    render(<TascamUS144MKIIView />)
    expect(screen.getByTestId('device-context-banner')).toHaveTextContent('TASCAM US-144MKII')
    // Tab list contains all six section labels
    expect(screen.getByRole('tab', { name: /I\/O Routing/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Metering/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Clock/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /S\/PDIF Bridge/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Diagnostics/i })).toBeInTheDocument()
  })

  it('surfaces the boot-mode warning notification when the device is mid-firmware-upload', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'ready' })
    setupQueries(STATUS_BOOT)
    render(<TascamUS144MKIIView />)
    expect(screen.getByText(/Device in boot\/loader stage/i)).toBeInTheDocument()
    expect(screen.getByText(/Unplug and replug/i)).toBeInTheDocument()
  })

  it('renders the empty state when no node hosts the device', () => {
    mockUseDeviceNodeContext.mockReturnValue({ deviceState: 'not_found' })
    setupQueries(null)
    render(<TascamUS144MKIIView />)
    expect(screen.getByTestId('empty-state')).toHaveTextContent(/No TASCAM US-144MKII/i)
  })
})
