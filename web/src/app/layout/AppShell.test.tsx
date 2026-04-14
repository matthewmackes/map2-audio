import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { AppShell } from './AppShell'

const mockRestartBackend = jest.fn()
const mockReloadHomeDesktopShell = jest.fn()
const mockReturnHomeDesktopToBoot = jest.fn()

jest.mock('../hooks/useHostMachine', () => ({
  useHostMachineInfo: () => ({
    data: {
      hostname: 'map2-host',
      kernel_version: '6.9.0-rt',
      os_version: 'Fedora Linux 42',
    },
  }),
}))

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => ({
    avb: { label: 'AVB: operational', state: 'ok' },
    avdecc: { label: 'AVDECC: 2 entities', state: 'ok' },
    nodes: { label: 'Nodes: 1 active', state: 'ok' },
  }),
}))

jest.mock('../../map2/clients/platform', () => ({
  systemApi: {
    restartBackend: (...args: unknown[]) => mockRestartBackend(...args),
  },
}))

jest.mock('../pages/homeDesktopSession', () => {
  const actual = jest.requireActual('../pages/homeDesktopSession')
  return {
    ...actual,
    reloadHomeDesktopShell: () => mockReloadHomeDesktopShell(),
    returnHomeDesktopToBoot: () => mockReturnHomeDesktopToBoot(),
  }
})

const mockUseWebSocketConnection = jest.fn()
const mockUsePushConfirmation = jest.fn()
const mockFetch = jest.fn()

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => mockUseWebSocketConnection(),
}))

jest.mock('../hooks/usePushConfirmation', () => ({
  usePushConfirmation: () => mockUsePushConfirmation(),
}))

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div data-testid="node-nav-bar">Nodes</div>,
}))

jest.mock('../components/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div data-testid="shell-latency-pressure-readout">09</div>,
}))

jest.mock('../components/TaskbarClock', () => ({
  TaskbarClock: () => <div data-testid="taskbar-clock">9:41 AM</div>,
}))

function renderInRouter(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

function ShellAwareContent() {
  return (
    <>
      <ShellWindowTitleStrip />
      <div>shell content</div>
    </>
  )
}

describe('AppShell taskbar shell', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
    mockUseWebSocketConnection.mockReturnValue({
      status: 'connected',
      client: null,
    })
    mockUsePushConfirmation.mockReturnValue({
      data: {
        status: 'ok',
        pending_confirmation: null,
        pending_count: 0,
      },
    })
    mockRestartBackend.mockReset()
    mockRestartBackend.mockResolvedValue({ status: 'restarting', message: 'Backend service is restarting...' })
    mockReloadHomeDesktopShell.mockReset()
    mockReturnHomeDesktopToBoot.mockReset()
    mockFetch.mockReset()
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/audio/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            running: true,
            sample_rate: 48000,
            buffer_size: 128,
            cpu_load: 0.12,
            engine: 'juce',
            available: true,
            available_input_devices: ['MOTU UltraLite mk5', 'Focusrite Clarett+ 4Pre'],
            available_output_devices: ['MOTU UltraLite mk5'],
          }),
        })
      }
      if (url.includes('/cluster/health/extended/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'local-node': {
                hostname: 'map2-host',
                status: 'online',
                usb_audio_devices: [],
                audio_interfaces: [],
                pipewire_devices: [],
              },
            },
          }),
        })
      }
      if (url.includes('/midi/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            inputs: [
              { name: 'Morningstar MC6 Pro', is_virtual: false },
              { name: 'Virtual Input 1', is_virtual: true },
            ],
            outputs: [
              { name: 'Morningstar MC6 Pro', is_virtual: false },
              { name: 'DIN Port A', kind: 'alsa' },
            ],
          }),
        })
      }
      return Promise.reject(new Error(`Unhandled fetch in AppShell.test.tsx: ${url}`))
    })
    global.fetch = mockFetch as typeof fetch
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    })
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('renders the persistent taskbar on the landing route without a titlebar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      ['/'],
    )

    expect(container.querySelector('.window-title-strip')).toBeNull()
    expect(screen.getByLabelText('Open platform menu')).toBeInTheDocument()
    expect(screen.getByTestId('taskbar-clock')).toBeInTheDocument()
  })

  it('renders non-landing routes with the title strip and the persistent taskbar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      ['/intelfx'],
    )

    expect(screen.getByLabelText('Open platform menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close IntelFX Rack' })).toBeInTheDocument()
    expect(container.querySelector('.window-title-strip__eyebrow')).toHaveTextContent('Workspace surface')
    expect(container.querySelector('.window-title-strip__title')).toHaveTextContent('IntelFX Rack')
    expect(container.querySelector('.window-taskbar')).toBeTruthy()
  })

  it('closes the current app back to the desktop route', async () => {
    renderInRouter(
      <AppShell>
        <>
          <ShellWindowTitleStrip />
          <LocationProbe />
        </>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close IntelFX Rack' }))

    await act(async () => {
      jest.advanceTimersByTime(50)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
  })

  it('starts Perform in true fullscreen and restores the launcher on Escape', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>perform content</div>
      </AppShell>,
      ['/perform'],
    )

    expect(container.querySelector('.shell-launcher')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close Stage' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(container.querySelector('.shell-launcher')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Close Stage' })).toBeNull()
  })

  it('shows the tall start-menu strip with tightened summary and canonical launchers', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    expect(screen.getAllByText('Mackes Audio Platform')).toHaveLength(2)
    expect(screen.getByText('Platform 0000000000000001')).toBeInTheDocument()
    expect(screen.getByText('Fedora Linux 42')).toBeInTheDocument()
    expect(screen.getByText('map2-host')).toBeInTheDocument()
    expect(screen.getByTestId('node-nav-bar')).toBeInTheDocument()
    expect(screen.getByTestId('shell-latency-pressure-readout')).toBeInTheDocument()
    expect(screen.getByTestId('taskbar-clock')).toBeInTheDocument()
    expect(screen.getByText('AVB: operational')).toBeInTheDocument()
    expect(screen.getByText('AVDECC: 2 entities')).toBeInTheDocument()
    expect(screen.getByText('Nodes: 1 active')).toBeInTheDocument()
    expect(screen.getByText('Audio Interfaces')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('MOTU UltraLite mk5')).toBeInTheDocument()
      expect(screen.getByText('Focusrite Clarett+ 4Pre')).toBeInTheDocument()
      expect(screen.getByText('MIDI Interfaces')).toBeInTheDocument()
      expect(screen.getByText('Morningstar MC6 Pro')).toBeInTheDocument()
      expect(screen.getByText('DIN Port A')).toBeInTheDocument()
      expect(screen.queryByText('Virtual Input 1')).not.toBeInTheDocument()
    })
    expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('/audio/status'))).toHaveLength(1)
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
    expect(screen.queryByText('All Workspaces')).not.toBeInTheDocument()
    expect(screen.queryByText('Audio Artifacts')).not.toBeInTheDocument()
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(6)

    const navStrip = container.querySelector('.shell-launcher__nav-strip')
    expect(navStrip).toBeTruthy()
    for (const label of ['Device(s) Manager', 'Snapshot Editor', 'Advanced MIDI', 'Brain', 'Drum-Machine', 'SynthForge']) {
      expect(within(navStrip as HTMLElement).getByText(label, { selector: '.start-menu-strip-item__label' })).toBeInTheDocument()
    }
    expect(within(navStrip as HTMLElement).queryByRole('menuitem', { name: /Stage Mode/i })).not.toBeInTheDocument()
    expect(within(navStrip as HTMLElement).queryByRole('menuitem', { name: /Workspaces/i })).not.toBeInTheDocument()
    expect(within(navStrip as HTMLElement).queryByRole('menuitem', { name: /Tesira AVB/i })).not.toBeInTheDocument()
  })

  it('shows empty interface copy when no physical audio or MIDI interfaces are detected', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/audio/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            running: true,
            sample_rate: 48000,
            buffer_size: 128,
            cpu_load: 0.12,
            engine: 'juce',
            available: true,
            available_input_devices: [],
            available_output_devices: [],
          }),
        })
      }
      if (url.includes('/cluster/health/extended/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'local-node': {
                hostname: 'map2-host',
                status: 'online',
                usb_audio_devices: [],
                audio_interfaces: ['ALSA', 'JACK'],
                pipewire_devices: [],
              },
            },
          }),
        })
      }
      if (url.includes('/midi/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            inputs: [{ name: 'Virtual Input 1', is_virtual: true }],
            outputs: [{ name: 'Virtual Output 1', is_virtual: true }],
          }),
        })
      }
      return Promise.reject(new Error(`Unhandled fetch in AppShell.test.tsx: ${url}`))
    })

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    await waitFor(() => {
      expect(screen.getByText('No audio interfaces detected')).toBeInTheDocument()
      expect(screen.getByText('No MIDI interfaces detected')).toBeInTheDocument()
    })
  })

  it('falls back to cluster hardware inventory when audio status omits connected interfaces', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/audio/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            running: false,
            sample_rate: 48000,
            buffer_size: 128,
            cpu_load: 0.0,
            engine: 'juce',
            available: true,
            available_input_devices: [],
            available_output_devices: [],
          }),
        })
      }
      if (url.includes('/cluster/health/extended/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'local-node': {
                hostname: 'map2-host',
                status: 'online',
                usb_audio_devices: [
                  { name: 'Hotone Jogg USB Audio', vid_pid: '84ef:0014' },
                ],
                audio_interfaces: ['ALSA', 'JACK'],
                pipewire_devices: [
                  { name: 'Jogg', description: 'Hotone Jogg USB Audio' },
                ],
              },
            },
          }),
        })
      }
      if (url.includes('/midi/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            inputs: [],
            outputs: [],
          }),
        })
      }
      return Promise.reject(new Error(`Unhandled fetch in AppShell.test.tsx: ${url}`))
    })

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    await waitFor(() => {
      expect(screen.getAllByText('Hotone Jogg USB Audio').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('No audio interfaces detected')).not.toBeInTheDocument()
  })

  it('keeps the last detected interface visible during a transient empty refresh', async () => {
    let audioRefresh = 0
    let midiRefresh = 0

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/audio/status')) {
        audioRefresh += 1
        return Promise.resolve({
          ok: true,
          json: async () => ({
            running: true,
            sample_rate: 48000,
            buffer_size: 128,
            cpu_load: 0.12,
            engine: 'juce',
            available: true,
            available_input_devices: audioRefresh === 1 ? ['MOTU UltraLite mk5'] : [],
            available_output_devices: [],
          }),
        })
      }
      if (url.includes('/cluster/health/extended/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'local-node': {
                hostname: 'map2-host',
                status: 'online',
                usb_audio_devices: [],
                audio_interfaces: [],
                pipewire_devices: [],
              },
            },
          }),
        })
      }
      if (url.includes('/midi/devices')) {
        midiRefresh += 1
        return Promise.resolve({
          ok: true,
          json: async () => ({
            inputs: midiRefresh === 1 ? [{ name: 'Morningstar MC6 Pro', is_virtual: false }] : [],
            outputs: [],
          }),
        })
      }
      return Promise.reject(new Error(`Unhandled fetch in AppShell.test.tsx: ${url}`))
    })

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    await waitFor(() => {
      expect(screen.getByText('MOTU UltraLite mk5')).toBeInTheDocument()
      expect(screen.getByText('Morningstar MC6 Pro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Close platform menu'))
    fireEvent.click(screen.getByLabelText('Open platform menu'))

    await waitFor(() => expect(audioRefresh).toBe(2))
    expect(screen.getByText('MOTU UltraLite mk5')).toBeInTheDocument()
    expect(screen.getByText('Morningstar MC6 Pro')).toBeInTheDocument()
    expect(screen.queryByText('No audio interfaces detected')).not.toBeInTheDocument()
    expect(screen.queryByText('No MIDI interfaces detected')).not.toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    expect(audioRefresh).toBe(2)
    expect(midiRefresh).toBe(2)
  })

  it('routes the Snapshot Editor strip item through the canonical snapshot editor route', () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Snapshot Editor/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/snapshot-editor')
  })

  it('routes Device(s) Manager into the unified platforms management workspace', () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Device\(s\) Manager/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/workspace/platforms/management')
  })

  it('moves focus into the launcher panel and restores it to the trigger when the panel closes', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    const launcherTrigger = screen.getByLabelText('Open platform menu')
    launcherTrigger.focus()
    fireEvent.click(launcherTrigger)

    expect(screen.getByRole('menuitem', { name: /Device\(s\) Manager/i })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })

    return waitFor(() => expect(screen.getByLabelText('Open platform menu')).toHaveFocus())
  })

  it('opens the power menu and runs refresh and logout actions', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))

    const powerMenu = document.querySelector('.cds--overflow-menu-options') as HTMLElement
    expect(powerMenu).toBeTruthy()
    expect(within(powerMenu).getByText('Restart backend')).toBeInTheDocument()
    expect(within(powerMenu).getByText('Refresh desktop')).toBeInTheDocument()
    expect(within(powerMenu).getByText('Log out')).toBeInTheDocument()

    fireEvent.click(within(powerMenu).getByText('Refresh desktop'))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))
    fireEvent.click(within(document.querySelector('.cds--overflow-menu-options') as HTMLElement).getByText('Log out'))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)
  })

  it('confirms backend restart from the power menu and shows restart progress', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))
    fireEvent.click(within(document.querySelector('.cds--overflow-menu-options') as HTMLElement).getByText('Restart backend'))

    expect(screen.getByText(/Audio processing will pause briefly/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }))

    await waitFor(() => expect(mockRestartBackend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Restarting backend')).toBeInTheDocument())
    expect(screen.getAllByText('Stopping engine').length).toBeGreaterThan(0)

    await act(async () => {
      jest.advanceTimersByTime(1300)
    })

    expect(screen.getAllByText('Restarting service').length).toBeGreaterThan(0)
  })

  it('renders the reconnect banner above the floating launcher when websocket state degrades', () => {
    mockUseWebSocketConnection.mockReturnValue({
      status: 'reconnecting',
      client: null,
    })

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    expect(screen.getByRole('status')).toHaveTextContent('Connection lost - reconnecting...')
    expect(container.querySelector('.shell-launcher')?.previousElementSibling).toHaveClass('mobile-connection-banner')
  })

  it('renders the Push confirmation notice pill ahead of node navigation when a pending action exists', () => {
    mockUsePushConfirmation.mockReturnValue({
      data: {
        status: 'ok',
        pending_confirmation: {
          action_id: 'push-confirm-9',
          action_type: 'instance_switch',
          reason: 'remote_instance',
          device_fingerprint: 'push-stage-left',
          device_identity: 'push-stage-left',
          target_instance_id: 'inst-1',
          target_display_name: 'Remote / Drums',
          target_node_id: 'node-b',
          target_node_label: 'Node B',
          created_at: 1000,
          expires_at: 1015,
          timeout_ms: 15000,
          accept_command: 'accept_pending_confirmation',
          reject_command: 'reject_pending_confirmation',
        },
        pending_count: 1,
      },
    })

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    const pill = screen.getByRole('status', { name: /Instance switch pending on push-stage-left/i })
    expect(pill).toHaveTextContent('Push confirmation')
    expect(pill).toHaveTextContent('Instance switch')
    const statusStrip = pill.closest('.window-taskbar__status-strip')
    expect(statusStrip).toBeTruthy()
    expect(screen.getByTestId('node-nav-bar').closest('.window-taskbar__pill')?.previousElementSibling).toBe(pill)
  })
})
