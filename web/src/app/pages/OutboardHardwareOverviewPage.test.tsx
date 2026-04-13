import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockUseTesiraDevices = jest.fn()
const mockUseDeviceLocation = jest.fn()
const mockUseMPX1State = jest.fn()
const mockUseIntelFXState = jest.fn()

jest.mock('../theme', () => ({
  useTheme: () => ({
    theme: { carbonTheme: 'g100' },
    themeId: 'default',
    setTheme: jest.fn(),
    themes: {},
  }),
}))

jest.mock('../components/Tesira/hooks/useTesiraApi', () => ({
  useTesiraDevices: () => mockUseTesiraDevices(),
}))

jest.mock('../hooks/useDeviceLocation', () => ({
  useDeviceLocation: (...args: unknown[]) => mockUseDeviceLocation(...args),
}))

jest.mock('../../map2/mpx1Api', () => ({
  useMPX1State: (...args: unknown[]) => mockUseMPX1State(...args),
}))

jest.mock('../../map2/intelfxApi', () => ({
  useIntelFXState: (...args: unknown[]) => mockUseIntelFXState(...args),
}))

const { OutboardHardwareShell } =
  jest.requireActual('./OutboardHardwareShell') as typeof import('./OutboardHardwareShell')
const { OutboardHardwareOverviewPage } =
  jest.requireActual('./OutboardHardwareOverviewPage') as typeof import('./OutboardHardwareOverviewPage')
const { OutboardHardwareDevicePage } =
  jest.requireActual('./OutboardHardwareDevicePage') as typeof import('./OutboardHardwareDevicePage')

function renderOverview(initialEntry = '/outboard-hardware') {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/outboard-hardware/*" element={<OutboardHardwareShell />}>
          <Route index element={<OutboardHardwareOverviewPage />} />
          <Route path=":deviceId" element={<OutboardHardwareDevicePage />} />
        </Route>
        <Route path="/tesira" element={<div>Tesira route</div>} />
        <Route path="/edirol-ua1000" element={<div>Edirol route</div>} />
        <Route path="/hotone-jogg" element={<div>HoTone route</div>} />
        <Route path="/mpx1/*" element={<div>MPX1 route</div>} />
        <Route path="/intelfx/*" element={<div>IntelFX route</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OutboardHardwareOverviewPage', () => {
  beforeEach(() => {
    mockUseTesiraDevices.mockReturnValue({
      data: [
        {
          device_id: 'tesira-main',
          host: '10.0.0.10',
          port: 23,
          name: 'Tesira Forte',
          connected: true,
          serial_number: 'ABC123',
          firmware_version: '1.0.0',
          fault_count: 0,
          avb_stream_count: 4,
          ptp_state: 'slave',
          source_node_id: 'node-a',
          source_hostname: 'rack-a',
        },
      ],
      isLoading: false,
      error: null,
    })
    mockUseDeviceLocation.mockImplementation((deviceType: string) => {
      if (deviceType === 'edirol-ua1000') {
        return {
          location: { nodeId: 'node-a', hostname: 'rack-a', kind: 'usb_audio', status: 'online' },
          isLoading: false,
          error: null,
        }
      }
      if (deviceType === 'hotone-jogg') {
        return {
          location: null,
          isLoading: false,
          error: null,
        }
      }
      if (deviceType === 'lexicon-mpx1') {
        return {
          location: { nodeId: 'node-b', hostname: 'rack-b', kind: 'midi', status: 'online' },
          isLoading: false,
          error: null,
        }
      }
      if (deviceType === 'rocktron-intelfx') {
        return {
          location: { nodeId: 'node-c', hostname: 'rack-c', kind: 'midi', status: 'offline' },
          isLoading: false,
          error: null,
        }
      }
      return {
        location: null,
        isLoading: false,
        error: null,
      }
    })
    mockUseMPX1State.mockReturnValue({
      state: { connected: true, current_program: 42, rtmidi_available: true },
      error: null,
    })
    mockUseIntelFXState.mockReturnValue({
      state: { connected: false, current_program: 0, rtmidi_available: false },
      error: null,
    })
  })

  it('shows the grouped hardware counts on the overview page', () => {
    renderOverview()

    expect(screen.getByText('Total devices')).toBeInTheDocument()
    expect(screen.getAllByText('AVB DSP Mixer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('USB Audio Interface').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Multi-FX Processor').length).toBeGreaterThan(0)
    expect(screen.getByText('5 devices')).toBeInTheDocument()
  })

  it('surfaces live status rollups for the grouped device cards', () => {
    renderOverview()

    const tesiraStatus = screen.getByLabelText('Tesira AVB live status')
    expect(within(tesiraStatus).getByText('Healthy')).toBeInTheDocument()
    expect(within(tesiraStatus).getByText('1/1 connected')).toBeInTheDocument()
    expect(within(tesiraStatus).getByText('rack-a')).toBeInTheDocument()

    const mpx1Card = screen.getByRole('heading', { name: 'MPX1 Rack', level: 2 }).closest('.cds--tile')
    expect(mpx1Card).not.toBeNull()
    expect(within(mpx1Card as HTMLElement).getByText(/responding on rack-b and reports program 42/i)).toBeInTheDocument()

    const intelfxStatus = screen.getByLabelText('IntelFX Rack live status')
    expect(within(intelfxStatus).getByText('Node offline')).toBeInTheDocument()
    expect(within(intelfxStatus).getByText('rack-c')).toBeInTheDocument()
  })

  it('opens the workspace detail page from a device card', () => {
    renderOverview()

    const tesiraCard = screen.getByRole('heading', { name: 'Tesira AVB', level: 2 }).closest('.cds--tile')
    expect(tesiraCard).not.toBeNull()
    fireEvent.click(within(tesiraCard as HTMLElement).getByRole('button', { name: 'Open in workspace' }))
    expect(screen.getByRole('heading', { name: 'Tesira AVB' })).toBeInTheDocument()
  })

  it('opens the dedicated route from a device card', () => {
    renderOverview()
    const mpx1Card = screen.getByRole('heading', { name: 'MPX1 Rack', level: 2 }).closest('.cds--tile')
    expect(mpx1Card).not.toBeNull()
    fireEvent.click(within(mpx1Card as HTMLElement).getByRole('button', { name: 'Open dedicated route' }))
    expect(screen.getByText('MPX1 route')).toBeInTheDocument()
  })
})
