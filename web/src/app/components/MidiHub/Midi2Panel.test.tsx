import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()

const emptyStatus = {
  enabled: true,
  default_protocol: 'midi2',
  local_muid: '0011223',
  device_count: 0,
  devices: [],
  binding: {
    transport: 'none',
    target_id: null,
    response_port: null,
    bound_at: null,
  },
  last_error: null,
  last_tx_at: null,
  last_tx_hex: null,
  last_tx_kind: null,
  last_tx_device_id: null,
  last_rx_at: null,
  last_rx_hex: null,
  last_rx_source: null,
  last_rx_device_id: null,
  discovery_pending_until: null,
}

const discoveredStatus = {
  ...emptyStatus,
  device_count: 1,
  devices: [
    {
      device_id: 'muid-0011223',
      protocol: 'midi2',
      remote_muid: '0011223',
      manufacturer_id: '7D 00 00',
      family_id: '01 00',
      model_id: '02 00',
      software_revision: '01 00 00 00',
      supports_profiles: true,
      supports_property_exchange: true,
      max_sysex_size: 512,
      discovery_state: 'confirmed',
      profile_state: 'confirmed',
      property_state: 'confirmed',
      profiles: { '7E 00 00 01 00': true },
      profile_details: {
        '7E 00 00 01 00@10': {
          profile_id: '7E 00 00 01 00',
          inquiry_target: 16,
          data_hex: '7B 22 6E 61 6D 65 22 3A 22 4F 72 67 61 6E 22 7D',
          data_text: '{"name":"Organ"}',
          data: { name: 'Organ' },
        },
      },
      properties: { ResourceList: [{ resource: 'DeviceInfo' }] },
      resources: ['DeviceInfo'],
      subscriptions: {
        sub_patch: {
          resource: 'patch_name',
          res_id: null,
          active: true,
          last_command: 'full',
          last_request_id: 12,
          last_update_at: 2,
          pending_refresh: false,
        },
      },
      property_exchange_capabilities: { ready: true, major_version: 0, minor_version: 0 },
      last_discovery_at: 1,
      last_request_at: 1,
      last_request_kind: 'property_get',
      last_request_id: 5,
      pending_request_kind: null,
      pending_request_id: null,
      pending_request_deadline: null,
      last_request_hex: 'F0 7E',
      last_response_at: 1,
      last_response_hex: 'F0 7E',
      last_response_source: 'm2-in',
      last_response_summary: 'Property Exchange capabilities 0.0',
    },
  ],
}

const mockMidiHubApi = {
  getMidi2Status: jest.fn(async () => emptyStatus),
  listNetworkSessions: jest.fn(async () => ({
    count: 2,
    sessions: [
      { session_id: 'send-only', host: '127.0.0.1', port: 56011, mode: 'send', active: true, created_at: 1 },
      { session_id: 'listen-1', host: '127.0.0.1', port: 56010, mode: 'listen', active: true, created_at: 1 },
    ],
  })),
  updateMidi2Config: jest.fn(async (payload: Record<string, unknown>) => ({
    ...emptyStatus,
    enabled: true,
    default_protocol: payload.default_protocol ?? 'midi2',
    binding: {
      transport: payload.binding_transport ?? 'none',
      target_id: payload.binding_target_id ?? null,
      response_port: payload.binding_response_port || null,
      bound_at: 1,
    },
  })),
  discoverMidi2Device: jest.fn(async () => ({
    ok: true,
    probe_id: 'discovery',
    discovery_sysex: [0xF0, 0x7E, 0x7F, 0x0D, 0x70, 0x02, 0xF7],
    transport: { ok: true, target_id: 'm2-out' },
  })),
  inquireMidi2Profiles: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  inquireMidi2ProfileDetails: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  setMidi2Profile: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  inquireMidi2PropertyExchangeCapabilities: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  invalidateMidi2Device: jest.fn(async () => ({
    ok: true,
    device_id: 'muid-0011223',
    target_muid: '0011223',
    removed_device_ids: ['muid-0011223'],
    transport: { ok: true },
  })),
  subscribeMidi2Property: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  endMidi2Subscription: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  readMidi2Property: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  setMidi2Property: jest.fn(async () => ({ ok: true, device: discoveredStatus.devices[0], transport: { ok: true } })),
  translateMidi1ToUmp: jest.fn(async () => ({ words: [546323556] })),
  translateUmpToMidi1: jest.fn(async () => ({ message: [0x90, 60, 100] })),
  inspectMidi2Ump: jest.fn(async () => ({
    messages: [{ type: 'midi2_channel_voice', kind: 'note_on', note: 60, velocity: 429496729 }],
  })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('./MidiHubNodeScope', () => ({
  useMidiHubNodeScope: () => ({ nodeId: null, scopeKey: 'local' }),
}))

jest.mock('./useMidiHubOverview', () => ({
  useMidiHubOverview: () => ({
    inputPorts: [
      { port_id: 'm2-in', name: 'MIDI 2 In', direction: 'duplex', kind: 'virtual' },
    ],
    outputPorts: [
      { port_id: 'm2-out', name: 'MIDI 2 Out', direction: 'duplex', kind: 'virtual' },
    ],
  }),
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

const { Midi2Panel } =
  require('./Midi2Panel') as typeof import('./Midi2Panel')

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Midi2Panel />
    </QueryClientProvider>,
  )
}

describe('Midi2Panel', () => {
  beforeEach(() => {
    mockPushToast.mockClear()
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())
    mockMidiHubApi.getMidi2Status.mockResolvedValue(emptyStatus)
  })

  it('requires a real transport target before sending discovery and only offers listen sessions for reply capture', async () => {
    renderComponent()

    expect(await screen.findByText('Devices 0')).toBeTruthy()
    expect(screen.queryByText('send-only · 127.0.0.1:56011')).toBeFalsy()

    const discoveryButton = screen.getByRole('button', { name: 'Send discovery' }) as HTMLButtonElement

    expect(discoveryButton.disabled).toBe(true)
  })

  it('exposes advanced profile, property, invalidation, and UMP inspection actions against confirmed discovered devices', async () => {
    mockMidiHubApi.getMidi2Status.mockResolvedValue(discoveredStatus)

    renderComponent()

    expect(await screen.findByText('Devices 1')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Transport binding'), {
      target: { value: 'port' },
    })
    fireEvent.change(screen.getByLabelText('Output target'), {
      target: { value: 'm2-out' },
    })
    fireEvent.change(screen.getByLabelText('Response input'), {
      target: { value: 'm2-in' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply protocol' }))

    await waitFor(() => expect(mockMidiHubApi.updateMidi2Config).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Query profiles' }))
    fireEvent.change(screen.getByLabelText('Profile ID (5-byte hex)'), {
      target: { value: '7E 00 00 01 00' },
    })
    fireEvent.change(screen.getByLabelText('Profile detail target'), {
      target: { value: '16' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Disable profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Query profile details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Query PE caps' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load ResourceList' }))
    fireEvent.change(screen.getByLabelText('Property resource'), {
      target: { value: 'patch_name' },
    })
    fireEvent.change(screen.getByLabelText('Property value (JSON or string)'), {
      target: { value: '"Init"' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Set property' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe resource' }))
    fireEvent.change(screen.getByLabelText('Subscription ID'), {
      target: { value: 'sub_patch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'End subscription' }))
    fireEvent.change(screen.getByLabelText('UMP words'), {
      target: { value: '16847412, 1083192320, 305419896' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Inspect UMP' }))
    await waitFor(() => expect(mockMidiHubApi.inspectMidi2Ump).toHaveBeenCalledWith([16847412, 1083192320, 305419896], null))
    fireEvent.click(screen.getByRole('button', { name: /Invalidate device/ }))

    await waitFor(() => {
      expect(mockMidiHubApi.inquireMidi2Profiles).toHaveBeenCalledWith('muid-0011223', null)
      expect(mockMidiHubApi.setMidi2Profile).toHaveBeenCalledWith('muid-0011223', '7E 00 00 01 00', false, null)
      expect(mockMidiHubApi.inquireMidi2ProfileDetails).toHaveBeenCalledWith('muid-0011223', '7E 00 00 01 00', 16, null)
      expect(mockMidiHubApi.inquireMidi2PropertyExchangeCapabilities).toHaveBeenCalledWith('muid-0011223', null)
      expect(mockMidiHubApi.readMidi2Property).toHaveBeenCalledWith('muid-0011223', 'ResourceList', undefined, null)
      expect(mockMidiHubApi.setMidi2Property).toHaveBeenCalledWith('muid-0011223', 'patch_name', 'Init', undefined, null)
      expect(mockMidiHubApi.subscribeMidi2Property).toHaveBeenCalledWith('muid-0011223', 'patch_name', undefined, null)
      expect(mockMidiHubApi.endMidi2Subscription).toHaveBeenCalledWith('muid-0011223', 'sub_patch', null)
      expect(mockMidiHubApi.invalidateMidi2Device).toHaveBeenCalledWith('muid-0011223', null)
    })

    expect(await screen.findByText(/midi2_channel_voice/)).toBeTruthy()
    expect(screen.getByText(/Profile detail 7E 00 00 01 00 @0x10/)).toBeTruthy()
    expect(screen.getByText(/Subscriptions sub_patch:patch_name/)).toBeTruthy()
  })
})
