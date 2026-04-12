import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { HostMachinePage } from './HostMachinePage'

const mockPushToast = jest.fn()
const mockRefresh = jest.fn()
const mockUseCluster = jest.fn()
const mockUseHostMachinePageData = jest.fn()

jest.mock('../components/PageHeader', () => ({
  PageHeader: ({ title, subtitle, icon }: { title: string; subtitle: string; icon?: React.ReactNode }) => (
    <div data-testid="page-header">
      {icon}
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useHostMachine', () => ({
  useHostMachinePageData: (...args: unknown[]) => mockUseHostMachinePageData(...args),
  useRefreshHostMachineData: () => mockRefresh,
}))

jest.mock('../components/HostMachine/BrandingPanel', () => ({
  __esModule: true,
  default: () => <div>Branding Panel</div>,
}))

jest.mock('../components/HostMachine/MachineSpecsCard', () => ({
  __esModule: true,
  default: () => <div>Machine Specs</div>,
}))

jest.mock('../components/HostMachine/DiskHealthCard', () => ({
  __esModule: true,
  default: () => <div>Disk Health</div>,
}))

jest.mock('../components/HostMachine/AudioNodeFeatures', () => ({
  __esModule: true,
  default: () => <div>Audio Features</div>,
}))

jest.mock('../components/HostMachine/PerformanceMetrics', () => ({
  __esModule: true,
  default: () => <div>Performance Metrics</div>,
}))

jest.mock('../components/Platform/PlatformGrafanaPanel', () => ({
  PlatformGrafanaPanelDeck: () => <div>Grafana Deck</div>,
}))

function makeDetailData() {
  return {
    hostInfo: {
      data: {
        cpu_cores: 8,
        cpu_threads: 16,
        total_memory_mb: 32768,
        cpu_frequency_mhz: 3600,
        cpu_model: 'Test CPU',
        system_uuid: 'uuid-123',
        bios_version: '1.2.3',
        bios_date: '2026-01-01',
        chassis_type: 'SFF',
        hostname: 'alpha',
        manufacturer: 'MAP2',
        product_name: 'Reference Node',
        kernel_version: '6.9.0',
      },
    },
    diskHealth: {
      data: {
        overall_health: 'good',
        disks: [{ size_gb: 512, estimated_lifespan_percent: 88 }],
      },
    },
    healthOverview: {
      data: {
        overall_health: 'good',
        cpu_temp_celsius: 42,
        cpu_usage_percent: 21,
        memory_usage_percent: 48,
        power: { current_load_percent: 31 },
      },
    },
    branding: {
      data: {
        brand_color: '#0f62fe',
        manufacturer: 'MAP2',
        logo_url: '/logo.svg',
        logo_fallback: '/logo.svg',
        product_image_url: '/node.png',
        marketing_name: 'Reference Node',
        product_name: 'Reference Node',
        support_url: 'https://example.com',
        warranty_status: 'Active',
        sff_optimized: true,
      },
    },
    clusterComparison: { data: [] },
    isLoading: false,
    isError: false,
    error: null,
  }
}

describe('HostMachinePage', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
    mockRefresh.mockReset()
    mockUseCluster.mockReset()
    mockUseHostMachinePageData.mockReset()
  })

  it('renders the loading shell', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-1',
      nodes: [],
      localNodeId: 'node-1',
    })
    mockUseHostMachinePageData.mockReturnValue({
      hostInfo: { data: null },
      diskHealth: { data: null },
      healthOverview: { data: null },
      branding: { data: null },
      clusterComparison: { data: [] },
      isLoading: true,
      isError: false,
      error: null,
    })

    render(<HostMachinePage />)

    expect(document.querySelector('.hm-page--loading')).toBeTruthy()
    expect(screen.getByRole('img', { name: /loading host machine data/i })).toBeInTheDocument()
  })

  it('renders the cluster comparison shell for all nodes', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'all',
      nodes: [{ nodeId: 'node-1', hostname: 'alpha', isOnline: true }],
      localNodeId: 'node-1',
    })
    mockUseHostMachinePageData.mockReturnValue({
      hostInfo: { data: null },
      diskHealth: { data: null },
      healthOverview: { data: null },
      branding: { data: null },
      clusterComparison: {
        data: [
          {
            nodeId: 'node-1',
            hostInfo: {
              hostname: 'alpha',
              cpu_cores: 8,
              cpu_threads: 16,
              cpu_model: 'Test CPU',
              total_memory_mb: 32768,
              manufacturer: 'MAP2',
              kernel_version: '6.9.0',
            },
            diskHealth: {
              overall_health: 'good',
              disks: [{ size_gb: 512, health_status: 'good' }],
            },
            hardware: {
              audio_interfaces: [],
            },
            healthOverview: {
              overall_health: 'good',
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    })

    render(<HostMachinePage />)

    expect(document.querySelector('.hm-page--cluster')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /host machine · all nodes/i })).toBeInTheDocument()
    expect(screen.getByText(/cluster-wide hardware comparison/i)).toBeInTheDocument()
    expect(screen.getByText(/none reported/i)).toBeInTheDocument()
  })

  it('renders the detail shell and service tab for a remote node', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-2',
      nodes: [
        { nodeId: 'node-1', hostname: 'local-node', latencyMs: 0.6 },
        { nodeId: 'node-2', hostname: 'remote-node', latencyMs: 1.7 },
      ],
      localNodeId: 'node-1',
    })
    mockUseHostMachinePageData.mockReturnValue(makeDetailData())

    render(<HostMachinePage />)

    expect(document.querySelector('.hm-page--detail')).toBeTruthy()
    expect(screen.getByText(/viewing remote node/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /service info/i }))

    expect(screen.getByText(/service information/i)).toBeInTheDocument()
    expect(screen.getByText(/export system report/i)).toBeInTheDocument()
  })
})
