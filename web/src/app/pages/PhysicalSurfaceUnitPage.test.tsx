import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { UnifiedWorkspaceData } from '../hooks/useUnifiedWorkspaceData'
import { buildWorkspacePhysicalSurfacesPath } from './physicalSurfacesRoutes'

const mockUseUnifiedWorkspaceData = jest.fn<UnifiedWorkspaceData, []>()
const mockSetUnitView = jest.fn()

jest.mock('../hooks/useUnifiedWorkspaceData', () => ({
  useUnifiedWorkspaceData: () => mockUseUnifiedWorkspaceData(),
}))

jest.mock('../../map2/clients/enrichedPhysicalSurfaces', () => ({
  enrichedPhysicalSurfacesApi: {
    setUnitView: (...args: unknown[]) => mockSetUnitView(...args),
  },
}))

const { PhysicalSurfaceUnitPage } =
  jest.requireActual('./PhysicalSurfaceUnitPage') as typeof import('./PhysicalSurfaceUnitPage')
const { WorkspacePhysicalSurfacesOutlet } =
  jest.requireActual('./workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet') as typeof import('./workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet')

function buildWorkspaceData({
  surfaceId = 'ableton-push',
}: {
  surfaceId?: string
} = {}): UnifiedWorkspaceData {
  return {
    summaries: {
      platforms: { key: 'platforms', label: 'Platforms', metric: '4 metrics', detail: 'steady', tone: 'positive', isLoading: false, isError: false },
      'physical-surfaces': { key: 'physical-surfaces', label: 'Physical Surfaces', metric: '1 units', detail: 'steady', tone: 'positive', isLoading: false, isError: false },
      artifacts: { key: 'artifacts', label: 'Audio Artifacts', metric: '0 assets', detail: 'steady', tone: 'info', isLoading: false, isError: false },
      'outboard-hardware': { key: 'outboard-hardware', label: 'Outboard Hardware', metric: '0 devices', detail: 'steady', tone: 'info', isLoading: false, isError: false },
    },
    orderedSummaries: [],
    physicalSurfaces: {
      summary: {
        stack_name: 'studio-surfaces',
        summary_generated_at: '2026-04-14T13:00:00Z',
        shared_operator_contract: {
          primary_role: 'controller',
          sub_menu_policy: 'fixed',
          multi_synth_mode: 'shared',
          page_layout_mode: 'fixed',
          view_sync: 'auto',
          target_follow_policy: 'recent-target',
          snapshot_strategy: 'runtime',
          community_firmware_support: 'qualified',
          surface_lab_mode: 'operator',
        },
        notifications: [],
        host_observations: {
          usb_devices: [],
          sound_cards: [],
          midi_hub_devices: [],
          python_modules: {},
        },
        units: [
          {
            unit_id: surfaceId,
            display_name: 'Ableton Push',
            family: 'Push family',
            device_type: 'controller',
            specialized_route: '/labs/push-surface',
            host_detected: true,
            status: 'online',
            status_reason: 'Connected to the local host and actively reporting.',
            capabilities: ['pads', 'display', 'transport', 'encoders'],
            integration_notes: ['Pads are mapped through the shared runtime profile.'],
            transport_layers: [
              { layer_id: 'session', label: 'Session', status: 'online', detail: 'Clip and scene launch available.' },
            ],
            matched_usb_devices: [{ profile_name: 'Push', manufacturer: 'Ableton', product: 'Push', alsa_id: 'hw:2,0' }],
            matched_sound_cards: [],
            matched_midi_devices: [{ profile_name: 'Push Input', manufacturer: 'Ableton', product: 'Push', alsa_id: 'hw:2,0' }],
            service_state: { daemon: 'running', latency_ms: 1.8 },
            firmware_posture: { status: 'qualified', detail: 'Current firmware has been qualified for the shared shell.' },
            view_state: {
              page_layout_mode: 'fixed',
              view_sync: 'auto',
              target_follow_policy: 'recent-target',
              current_view_id: 'session',
              current_view_label: 'Session',
              current_view_source: 'runtime',
              recent_target: { target_id: 'snap-1', label: 'Lead Snapshot', kind: 'snapshot', source: 'brain' },
              is_override_active: false,
              views: [
                {
                  view_id: 'session',
                  label: 'Session',
                  category: 'performance',
                  note: 'Default live view.',
                  presentation: { palette: 'amber' },
                  zones: [{ zone_id: 'pads', label: 'Pads', role: 'launch', controls: ['clips', 'scenes'] }],
                },
                {
                  view_id: 'mix',
                  label: 'Mix',
                  category: 'mixer',
                  note: 'Encoder focus.',
                  presentation: { palette: 'blue' },
                  zones: [{ zone_id: 'encoders', label: 'Encoders', role: 'mix', controls: ['volume', 'sends'] }],
                },
              ],
            },
            surface_lab: { enabled: true, access: 'operator', features: ['capture', 'replay'], snapshot: { transport: 'running' } },
          },
        ],
      },
      isLoading: false,
      isError: false,
    },
  }
}

function renderUnit(initialEntry = '/workspace/physical-surfaces/ableton-push') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/workspace/physical-surfaces" element={<WorkspacePhysicalSurfacesOutlet />}>
            <Route path=":surfaceId" element={<PhysicalSurfaceUnitPage buildUnitPath={buildWorkspacePhysicalSurfacesPath} />} />
            <Route index element={<div>Overview route</div>} />
          </Route>
          <Route path="/labs/push-surface" element={<div>Dedicated route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PhysicalSurfaceUnitPage', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    mockUseUnifiedWorkspaceData.mockImplementation(() => buildWorkspaceData())
    mockSetUnitView.mockResolvedValue({})
    consoleErrorSpy.mockClear()
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders the detail sections and route actions without console errors', () => {
    renderUnit()

    expect(screen.getByRole('heading', { name: 'Ableton Push' })).toBeInTheDocument()
    expect(screen.getByText('Integration posture')).toBeInTheDocument()
    expect(screen.getByText('Operational guidance')).toBeInTheDocument()
    expect(screen.getByText('Per-family page model')).toBeInTheDocument()
    expect(screen.getByText('Advanced tooling')).toBeInTheDocument()
    expect(screen.getByText('Current backend context')).toBeInTheDocument()
    expect(screen.getByText('Shared MIDI inventory')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ableton Push performance controller hero artwork' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Existing Route' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Overview' })).toBeInTheDocument()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('invokes the view mutation when the operator selects another fixed view', async () => {
    renderUnit()

    fireEvent.click(screen.getByRole('button', { name: 'Use View' }))

    await waitFor(() => {
      expect(mockSetUnitView).toHaveBeenCalledWith('ableton-push', 'mix')
    })
  })

  it('shows the not-found empty state when the requested surface does not exist', () => {
    renderUnit('/workspace/physical-surfaces/missing-surface')

    expect(screen.getByRole('heading', { name: 'Physical Surface Not Found' })).toBeInTheDocument()
    expect(screen.getByText('Return to the overview')).toBeInTheDocument()
  })
})
