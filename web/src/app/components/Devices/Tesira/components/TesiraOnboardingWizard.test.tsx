import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraOnboardingWizard } from './TesiraOnboardingWizard'

const mockNavigate = jest.fn()
const mockStartDiscovery = jest.fn()
const mockAdoptDeviceAsync = jest.fn()
const mockAddDeviceAsync = jest.fn()
const mockConnectDeviceAsync = jest.fn()
const mockReconnectDeviceAsync = jest.fn()

const mockUseTesiraDevices = jest.fn()
const mockUseDiscoveryStatus = jest.fn()
const mockUseTesiraLayouts = jest.fn()

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

jest.mock('../../../../../map2/api', () => ({
  tesiraApi: {
    getLayoutManualPackageDownloadUrl: jest.fn(() => '/api/tesira/layouts/default/manual-package'),
  },
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevices: () => mockUseTesiraDevices(),
  useDiscoveryStatus: () => mockUseDiscoveryStatus(),
  useTesiraLayouts: () => mockUseTesiraLayouts(),
  useStartDiscovery: () => ({
    mutate: mockStartDiscovery,
    isPending: false,
  }),
  useAdoptDevice: () => ({
    mutateAsync: mockAdoptDeviceAsync,
    isPending: false,
  }),
  useAddDevice: () => ({
    mutateAsync: mockAddDeviceAsync,
    isPending: false,
  }),
  useConnectDevice: () => ({
    mutateAsync: mockConnectDeviceAsync,
    isPending: false,
  }),
  useReconnectDevice: () => ({
    mutateAsync: mockReconnectDeviceAsync,
    isPending: false,
  }),
}))

describe('TesiraOnboardingWizard', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockStartDiscovery.mockReset()
    mockAdoptDeviceAsync.mockReset()
    mockAddDeviceAsync.mockReset()
    mockConnectDeviceAsync.mockReset()
    mockReconnectDeviceAsync.mockReset()

    mockUseTesiraDevices.mockReturnValue({
      data: [],
    })
    mockUseDiscoveryStatus.mockReturnValue({
      data: {
        is_scanning: false,
        devices: [],
        error: null,
      },
    })
    mockUseTesiraLayouts.mockReturnValue({
      data: {
        count: 1,
        layouts: [
          {
            layout_id: 'forte_ci_default',
            version: '1.0.0',
            name: 'Forte CI Default',
            device_family: 'TesiraFORTE CI',
            channel_profile: 'stereo',
            required_firmware: '4.11.1.2',
            checksum: 'abc123',
            artifact_uri: null,
            instance_tag_map: {},
            feature_flags: [],
            notes: 'Default MAP2 control layout.',
            is_active: true,
            created_at: null,
            updated_at: null,
          },
        ],
      },
    })
  })

  it('defaults to the serial recovery method and lets the operator switch methods', () => {
    render(<TesiraOnboardingWizard />)

    expect(screen.getByText('Tesira Onboarding Wizard')).toBeTruthy()
    expect(screen.getByText('Serial Recovery')).toBeTruthy()

    fireEvent.click(screen.getByText('Manual IP Enrollment'))

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Recover and Reset the Device')).toBeTruthy()
    expect(screen.getByText('Manual IP Enrollment')).toBeTruthy()
  })

  it('adds a device by known IP during the enrollment step', async () => {
    mockAddDeviceAsync.mockResolvedValue({ ok: true, message: 'added' })

    render(<TesiraOnboardingWizard />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.click(screen.getByLabelText(/Physical access is available/i))
    fireEvent.click(screen.getByLabelText(/Factory reset completed or scheduled/i))
    fireEvent.click(screen.getByLabelText(/Serial recovery is complete/i))
    fireEvent.click(screen.getByLabelText(/The control-network handoff is ready/i))

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.change(screen.getByLabelText('Friendly name'), {
      target: { value: 'Recovered DSP' },
    })
    fireEvent.change(screen.getByLabelText('Tesira host'), {
      target: { value: '192.168.10.55' },
    })
    fireEvent.change(screen.getByLabelText('TTP port'), {
      target: { value: '23' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add to Tesira fleet' }))

    await waitFor(() => {
      expect(mockAddDeviceAsync).toHaveBeenCalledWith({
        host: '192.168.10.55',
        port: 23,
        name: 'Recovered DSP',
      })
    })
  })
})
