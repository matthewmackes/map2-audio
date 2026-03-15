import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformShellPage } from './PlatformShellPage'
import { PLATFORM_LAYER_META, makePlatformHealthRecord } from '../platform/model'
import { usePlatformStore } from '../stores/platformStore'

const mockUsePlatformShellData = jest.fn()
const mockUseMidiClusterNodes = jest.fn()
const mockUseMidiClusterConnections = jest.fn()
const mockUseMidiClusterEndpoints = jest.fn()

jest.mock('../hooks/usePlatformShellData', () => ({
  usePlatformShellData: () => mockUsePlatformShellData(),
}))

jest.mock('../hooks/useMidiCluster', () => ({
  useMidiClusterNodes: () => mockUseMidiClusterNodes(),
  useMidiClusterConnections: () => mockUseMidiClusterConnections(),
  useMidiClusterEndpoints: () => mockUseMidiClusterEndpoints(),
}))

jest.mock('../components/MidiCluster/MidiClusterNodeCard', () => ({
  MidiClusterNodeCard: ({ node }: any) => <div>{`MIDI node ${node.hostname}`}</div>,
}))

jest.mock('../components/MidiCluster/MidiClusterTopology', () => ({
  MidiClusterTopology: () => <div data-testid="midi-topology">MIDI topology</div>,
}))

const midiNodes = [
  {
    node_id: 'node-a',
    hostname: 'node-a',
    online: true,
    ports: [],
    capabilities: { input_ports: [], output_ports: [], clock_source: 'internal' },
  },
]

const midiConnections = [
  {
    connection_id: 'connection-1',
    state: 'connected',
    transport: 'rtp-midi',
    source: { node_id: 'node-a', endpoint_id: 'endpoint-1' },
    destination: { node_id: 'node-a', endpoint_id: 'endpoint-2' },
  },
]

const midiEndpoints = [
  {
    endpoint_id: 'endpoint-1',
    node_id: 'node-a',
    device_name: 'Synth Rack',
    port_name: 'DIN A',
    direction: 'input',
    available: true,
  },
]

const mockData = {
  layers: PLATFORM_LAYER_META.map((layer, index) => ({
    ...layer,
    health: index === 0 ? 'warning' : 'healthy',
    activityLevel: 45 + index * 6,
    alertCount: index === 0 ? 1 : 0,
    isLoading: false,
    error: null,
    summaryMetrics: [
      {
        id: `${layer.id}-metric`,
        label: 'Metric',
        value: String(index + 1),
        helper: 'helper copy',
        tone: 'info',
      },
    ],
    gridItems: [
      {
        id: `${layer.id}-grid`,
        title: 'Grid item',
        eyebrow: 'Eyebrow',
        metric: `${index + 1}`,
        helper: 'Grid helper',
        status: index === 0 ? 'warning' : 'healthy',
      },
    ],
    tableColumns: layer.id === 'midi-cluster'
      ? [
          { key: 'device', header: 'Device' },
          { key: 'port', header: 'Port' },
          { key: 'clusterNode', header: 'Cluster Node' },
          { key: 'activity', header: 'Activity' },
          { key: 'status', header: 'Status' },
        ]
      : [
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
        ],
    tableRows: layer.id === 'midi-cluster'
      ? [
          {
            id: 'endpoint-1',
            device: 'Synth Rack',
            port: 'DIN A (input)',
            clusterNode: 'node-a',
            activity: '1 route',
            status: 'healthy',
          },
        ]
      : [
          {
            id: `${layer.id}-row`,
            name: `${layer.label} row`,
            status: index === 0 ? 'warning' : 'healthy',
          },
        ],
    tableTitle: `${layer.label} table`,
    tableDescription: 'table description',
    notifications: index === 0 ? [{
      id: `${layer.id}-alert`,
      severity: 'warning',
      title: 'Overview degraded',
      subtitle: 'One layer needs attention.',
    }] : [],
  })),
  layerHealth: makePlatformHealthRecord((layerId) => (layerId === 'overview' ? 'warning' : 'healthy')),
  summaryMetrics: [
    { id: 'nodes', label: 'Nodes', value: '2/2', helper: 'Online', tone: 'healthy' },
    { id: 'alerts', label: 'Alerts', value: '1', helper: 'Current alerts', tone: 'warning' },
  ],
  alerts: [
    {
      id: 'overview-alert',
      layerId: 'overview',
      severity: 'warning',
      title: 'Overview degraded',
      subtitle: 'One layer needs attention.',
    },
  ],
}

function renderPage(initialEntries: string[] = ['/platform']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <PlatformShellPage />
    </MemoryRouter>,
  )
}

describe('PlatformShellPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
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
    window.localStorage.clear()
    mockUsePlatformShellData.mockReset()
    mockUseMidiClusterNodes.mockReset()
    mockUseMidiClusterConnections.mockReset()
    mockUseMidiClusterEndpoints.mockReset()

    mockUsePlatformShellData.mockReturnValue(mockData)
    mockUseMidiClusterNodes.mockReturnValue({ data: midiNodes, isLoading: false })
    mockUseMidiClusterConnections.mockReturnValue({ data: midiConnections, isLoading: false })
    mockUseMidiClusterEndpoints.mockReturnValue({ data: midiEndpoints, isLoading: false })

    usePlatformStore.setState({
      currentView: 'stack',
      activeLayer: null,
      layerHealth: makePlatformHealthRecord(() => 'unknown'),
      alerts: [],
      summaryMetrics: [],
      animationState: {
        expandingLayer: null,
        collapsingLayer: null,
      },
    })
  })

  it('renders the stack view without crashing', async () => {
    renderPage()

    expect(screen.getByText('Unified Platform Stack')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Open Overview layer' })).toBeTruthy()
    expect(screen.getByText('Choose a layer to flatten the stack into a focused workspace.')).toBeTruthy()
  })

  it('changes active layer when a stack plane is clicked', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Open Overview layer' }))

    expect(await screen.findByRole('button', { name: /Back to Platform Stack/i })).toBeTruthy()
    expect(screen.getByText('Overview table')).toBeTruthy()
  })

  it('ignores removed cluster dashboard tab query params and renders the default cluster workspace', async () => {
    renderPage(['/platform?layer=cluster-dashboard&clusterTab=nodes'])

    await waitFor(() => {
      expect(screen.getByText('Cluster Dashboard table')).toBeInTheDocument()
    })
    expect(screen.queryByRole('tab', { name: 'Nodes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Multi-System' })).not.toBeInTheDocument()
  })

  it('shows MIDI node detail when an endpoint row is selected', async () => {
    renderPage(['/platform?layer=midi-cluster'])

    fireEvent.click(await screen.findByText('Synth Rack'))

    expect(await screen.findByText('Node Detail')).toBeInTheDocument()
    expect(screen.getByText('MIDI node node-a')).toBeInTheDocument()
    expect(screen.getByTestId('midi-topology')).toBeInTheDocument()
  })
})
