import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AvbRoutingWorkspace } from './AvbRoutingWorkspace'
import type { PlatformLayerData } from '../../platform/model'

const mockUseCluster = jest.fn()
const mockUseNodes = jest.fn()
const mockUsePtpStatus = jest.fn()
const mockUseEndpoints = jest.fn()
const mockUseConnections = jest.fn()
const mockUseAvbStreams = jest.fn()
const mockUseAvbDevices = jest.fn()
const mockUseAvdeccEntities = jest.fn()
const mockUseTesiraDevices = jest.fn()
const mockUseTesiraDevice = jest.fn()

jest.mock('../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('./hooks/useNodeApi', () => ({
  useNodes: () => mockUseNodes(),
  usePtpStatus: () => mockUsePtpStatus(),
}))

jest.mock('./hooks/useAvbApi', () => ({
  useEndpoints: () => mockUseEndpoints(),
  useConnections: () => mockUseConnections(),
  useAvbStreams: () => mockUseAvbStreams(),
  useAvbDevices: () => mockUseAvbDevices(),
  useAvdeccEntities: () => mockUseAvdeccEntities(),
}))

jest.mock('../Tesira/hooks/useTesiraApi', () => ({
  useTesiraDevices: () => mockUseTesiraDevices(),
  useTesiraDevice: (...args: unknown[]) => mockUseTesiraDevice(...args),
}))

jest.mock('./AvbRoutingWorkspaceGraph', () => ({
  AvbRoutingWorkspaceGraph: ({ onSelect }: { onSelect: (selection: { anchorId: 'avb-routing-nodes'; recordId: string; selectionKind: 'node' | 'tesira'; contextNodeId: string | null }) => void }) => (
    <button
      type="button"
      data-testid="avb-routing-graph"
      onClick={() => onSelect({
        anchorId: 'avb-routing-nodes',
        recordId: 'tesira-1',
        selectionKind: 'tesira',
        contextNodeId: 'node-remote',
      })}
    >
      AVB Graph Mock
    </button>
  ),
}))

const layer: PlatformLayerData = {
  id: 'avb-routing',
  label: 'AVB Routing',
  shortLabel: 'AVB',
  description: 'AVB routing',
  accent: 'var(--cds-support-info)',
  health: 'healthy',
  activityLevel: 80,
  alertCount: 0,
  isLoading: false,
  error: null,
  summaryMetrics: [],
  gridItems: [
    {
      id: 'streams',
      title: 'Streams',
      eyebrow: 'AVB',
      metric: '2',
      helper: '1 ready',
      status: 'healthy',
    },
  ],
  tableColumns: [],
  tableRows: [],
  tableTitle: 'AVB table',
  tableDescription: 'AVB table',
  notifications: [],
}

describe('AvbRoutingWorkspace', () => {
  beforeEach(() => {
    const mockSetActiveNode = jest.fn()

    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
        { nodeId: 'node-remote', hostname: 'remote-rack', role: 'AUDIO-NODE', isLocal: false, isOnline: true, latencyMs: 2.4, lastSeen: null },
      ],
      isClusterMode: false,
      localNodeId: 'node-local',
      setActiveNode: mockSetActiveNode,
    })

    mockUseNodes.mockReturnValue({
      data: [
        {
          node_id: 'node-local',
          name: 'Node Local',
          type: 'map2_local',
          status: 'online',
          capabilities: { talker: true, listener: true, avdecc_controller: false, audio_processing: true, remote_control: true, max_talkers: 8, max_listeners: 8, sample_rates: [48000], formats: ['24-bit PCM'] },
          ptp: { state: 'master', domain: 0, is_master: true, master_clock_id: 'node-local', offset_ns: 0, last_sync: '2026-04-03T21:55:00.000Z', gptp_supported: true },
          health: { cpu_usage: 10, memory_usage: 30, latency_ms: 1.2, packet_loss: 0, last_check: '2026-04-03T21:55:00.000Z', status: 'healthy' },
          address: '10.0.0.1',
          api_url: 'http://10.0.0.1:8080',
          entity_id: 'ent-local',
          talker_count: 1,
          listener_count: 1,
          active_routes: 1,
          version: '1.0.0',
          manufacturer: 'MAP2',
          model: 'Rack',
          discovered_at: '2026-04-03T21:40:00.000Z',
          last_seen: '2026-04-03T21:55:00.000Z',
          color: '#0f62fe',
          pinned: false,
          notes: '',
        },
        {
          node_id: 'node-remote',
          name: 'Node Remote',
          type: 'map2_remote',
          status: 'online',
          capabilities: { talker: true, listener: true, avdecc_controller: false, audio_processing: true, remote_control: true, max_talkers: 8, max_listeners: 8, sample_rates: [48000], formats: ['24-bit PCM'] },
          ptp: { state: 'slave', domain: 0, is_master: false, master_clock_id: 'node-local', offset_ns: 42, last_sync: '2026-04-03T21:55:00.000Z', gptp_supported: true },
          health: { cpu_usage: 16, memory_usage: 32, latency_ms: 2.1, packet_loss: 0, last_check: '2026-04-03T21:55:00.000Z', status: 'healthy' },
          address: '10.0.0.2',
          api_url: 'http://10.0.0.2:8080',
          entity_id: 'ent-remote',
          talker_count: 1,
          listener_count: 1,
          active_routes: 1,
          version: '1.0.0',
          manufacturer: 'MAP2',
          model: 'Rack',
          discovered_at: '2026-04-03T21:40:00.000Z',
          last_seen: '2026-04-03T21:55:00.000Z',
          color: '#1192e8',
          pinned: false,
          notes: '',
        },
      ],
      isLoading: false,
      error: null,
    })

    mockUsePtpStatus.mockReturnValue({
      data: { master_node_id: 'node-local' },
      isLoading: false,
      error: null,
    })

    mockUseEndpoints.mockReturnValue({
      data: {
        endpoints: [
          { endpoint_id: 'ent-local:1', entity_id: 'ent-local', unique_id: 1, direction: 'talker', device_type: 'map2', device_name: 'Local talker', channels: 2, sample_rate: 48000, format: '24-bit PCM', mac_address: null, node_address: 'http://10.0.0.1:8080', node_id: 'node-local', host: '10.0.0.1', available: true, last_seen: '2026-04-03T21:55:00.000Z' },
          { endpoint_id: 'ent-remote:1', entity_id: 'ent-remote', unique_id: 1, direction: 'listener', device_type: 'tesira', device_name: 'Remote listener', channels: 2, sample_rate: 48000, format: '24-bit PCM', mac_address: null, node_address: 'http://10.0.0.2:8080', node_id: 'node-remote', host: '10.0.0.2', available: true, last_seen: '2026-04-03T21:55:00.000Z' },
        ],
      },
      isLoading: false,
      error: null,
    })

    mockUseConnections.mockReturnValue({
      data: {
        connections: [
          {
            connection_id: 'route-1',
            talker: { endpoint_id: 'ent-local:1', device_name: 'Local talker', node_id: 'node-local' },
            listener: { endpoint_id: 'ent-remote:1', device_name: 'Remote listener', node_id: 'node-remote' },
            state: 'connected',
            established_time: '2026-04-03T21:55:00.000Z',
            error_message: null,
            srp_reservation_id: null,
            srp_admission_id: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    mockUseAvbStreams.mockReturnValue({
      data: {
        streams: [
          {
            stream_id: 'map2-talker-ent-local-1-ent-remote-1',
            direction: 'talker',
            state: 'running',
            health: {
              ready: true,
              issues: [],
              interface: 'eno1',
              ptp: { available: true, state: 'slave', offset_ns: 42, mean_path_delay_ns: 900, last_update: null, error: null },
              tsn: { available: true, interface: 'eno1', mqprio_configured: true, cbs_configured: true, etf_configured: true, vlan_configured: true, error: null },
            },
            ownership: {
              node_ids: ['node-local', 'node-remote'],
              endpoint_ids: ['ent-local:1', 'ent-remote:1'],
              owner_node_id: 'node-local',
              peer_node_id: 'node-remote',
              owner_endpoint_id: 'ent-local:1',
              peer_endpoint_id: 'ent-remote:1',
              talker_node_id: 'node-local',
              listener_node_id: 'node-remote',
              talker_endpoint_id: 'ent-local:1',
              listener_endpoint_id: 'ent-remote:1',
            },
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    mockUseAvbDevices.mockReturnValue({
      data: {
        available: true,
        count: 2,
        device_names: ['Local talker', 'Remote listener'],
        discovered_count: 2,
        discovered_devices: [],
      },
      isLoading: false,
      error: null,
    })

    mockUseAvdeccEntities.mockReturnValue({
      data: {
        enabled: true,
        entities: [
          {
            entity_id: 'ent-remote',
            entity_model_id: 'model-1',
            entity_name: 'Remote entity',
            firmware_version: '1.0.0',
            mac_address: '00:11:22:33:44:55',
            source_node_id: 'node-remote',
            capabilities: {
              talker_streams: 0,
              listener_streams: 1,
              is_audio_talker: false,
              is_audio_listener: true,
              gptp_supported: true,
            },
            ptp: {
              grandmaster_id: 'node-local',
              domain: 0,
            },
            available: true,
            last_seen: '2026-04-03T21:55:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    mockUseTesiraDevices.mockReturnValue({
      data: [
        {
          device_id: 'tesira-1',
          host: '10.0.0.20',
          port: 23,
          name: 'Forte AVB',
          connected: true,
          serial_number: 'serial-1',
          firmware_version: '4.5.1',
          fault_count: 0,
          avb_stream_count: 1,
          ptp_state: 'SLAVE',
          source_node_id: 'node-remote',
          source_hostname: 'remote-rack',
          discovered_by_node_ids: ['node-remote'],
          discovered_by_hosts: ['remote-rack'],
        },
      ],
      isLoading: false,
      error: null,
    })

    mockUseTesiraDevice.mockReturnValue({
      data: {
        device_id: 'tesira-1',
        host: '10.0.0.20',
        port: 23,
        name: 'Forte AVB',
        connected: true,
        serial_number: 'serial-1',
        firmware_version: '4.5.1',
        fault_count: 0,
        avb_stream_count: 1,
        ptp_state: 'SLAVE',
        source_node_id: 'node-remote',
        source_hostname: 'remote-rack',
        discovered_by_node_ids: ['node-remote'],
        discovered_by_hosts: ['remote-rack'],
        hostname: 'forte-avb',
        avb_streams: [
          { stream_index: 1, direction: 'listener', name: 'Program Bus', channels: 2, entity_id: 'ent-remote' },
        ],
        ptp_status: { state: 'SLAVE', offset_ns: 42, grandmaster_id: 'node-local' },
        faults: [],
        presets: [],
      },
      isLoading: false,
      error: null,
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
  })

  it('preloads the focused Tesira node context and renders Tesira-aware row detail', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platforms/avb-routing?focusTesiraDevice=tesira-1&focusEntity=ent-remote']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AvbRoutingWorkspace layer={layer} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Transport nodes')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('Tesira interface detail').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('Forte AVB')).toBeInTheDocument()
    expect(screen.getByText('Program Bus')).toBeInTheDocument()
    expect(mockUseCluster.mock.results[0].value.setActiveNode).toHaveBeenCalledWith('node-remote')
  })
})
