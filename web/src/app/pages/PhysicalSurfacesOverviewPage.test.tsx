import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { UnifiedWorkspaceData } from '../hooks/useUnifiedWorkspaceData'
import { buildWorkspacePhysicalSurfacesPath } from './physicalSurfacesRoutes'

const mockUseUnifiedWorkspaceData = jest.fn<UnifiedWorkspaceData, []>()

jest.mock('../hooks/useUnifiedWorkspaceData', () => ({
  useUnifiedWorkspaceData: () => mockUseUnifiedWorkspaceData(),
}))

const { PhysicalSurfacesOverviewPage } =
  jest.requireActual('./PhysicalSurfacesOverviewPage') as typeof import('./PhysicalSurfacesOverviewPage')
const { WorkspacePhysicalSurfacesOutlet } =
  jest.requireActual('./workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet') as typeof import('./workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet')

function buildWorkspaceData({
  units = [
    {
      unit_id: 'ableton-push',
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
        { layer_id: 'mix', label: 'Mix', status: 'detected', detail: 'Encoder banking detected.' },
      ],
      matched_usb_devices: [],
      matched_sound_cards: [],
      matched_midi_devices: [{ profile_name: 'Push Input', manufacturer: 'Ableton', product: 'Push', alsa_id: 'hw:2,0' }],
      service_state: { daemon: 'running' },
      firmware_posture: { status: 'qualified', detail: 'Current firmware has been qualified for the shared shell.' },
      view_state: {
        page_layout_mode: 'fixed',
        view_sync: 'auto',
        target_follow_policy: 'recent-target',
        current_view_id: 'session',
        current_view_label: 'Session',
        current_view_source: 'runtime',
        recent_target: null,
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
        ],
      },
      surface_lab: { enabled: true, access: 'operator', features: ['capture'], snapshot: { transport: 'running' } },
    },
  ],
  isLoading = false,
}: {
  units?: UnifiedWorkspaceData['physicalSurfaces']['summary'] extends { units: infer T } ? T : never
  isLoading?: boolean
} = {}): UnifiedWorkspaceData {
  return {
    summaries: {
      platforms: { key: 'platforms', label: 'Platforms', metric: '4 metrics', detail: 'steady', tone: 'positive', isLoading: false, isError: false },
      'physical-surfaces': { key: 'physical-surfaces', label: 'Physical Surfaces', metric: `${units.length} units`, detail: 'steady', tone: 'positive', isLoading: false, isError: false },
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
          maschinen_mk1_host_note: 'Maschine MK1 needs the legacy user-space helper on this host.',
        },
        units,
      },
      isLoading,
      isError: false,
    },
  }
}

function renderOverview(initialEntry = '/workspace/physical-surfaces') {
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
            <Route index element={<PhysicalSurfacesOverviewPage buildUnitPath={buildWorkspacePhysicalSurfacesPath} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PhysicalSurfacesOverviewPage', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    mockUseUnifiedWorkspaceData.mockImplementation(() => buildWorkspaceData())
    consoleErrorSpy.mockClear()
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders header metrics, host observation copy, and unit-card details without console errors', () => {
    renderOverview()

    expect(screen.getByRole('heading', { name: 'Physical Surfaces' })).toBeInTheDocument()
    expect(screen.getByText('1 online')).toBeInTheDocument()
    expect(screen.getByText('1 units')).toBeInTheDocument()
    expect(screen.getByText('Maschine MK1 needs the legacy user-space helper on this host.')).toBeInTheDocument()

    const unitCard = screen.getByRole('heading', { name: 'Ableton Push', level: 2 }).closest('.cds--tile')
    expect(unitCard).not.toBeNull()
    expect(within(unitCard as HTMLElement).getByText('Connected to the local host and actively reporting.')).toBeInTheDocument()
    expect(within(unitCard as HTMLElement).getByText('Current view:')).toBeInTheDocument()
    expect(within(unitCard as HTMLElement).getByRole('button', { name: 'Open Surface Page' })).toBeInTheDocument()
    expect(within(unitCard as HTMLElement).getByRole('button', { name: /Ableton Push performance controller hero artwork View Dedicated Route/i })).toBeInTheDocument()
    expect(within(unitCard as HTMLElement).getByRole('img', { name: 'Ableton Push performance controller hero artwork' })).toBeInTheDocument()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('shows the empty state when the workspace summary returns no units', () => {
    mockUseUnifiedWorkspaceData.mockImplementation(() => buildWorkspaceData({ units: [] }))

    renderOverview()

    expect(screen.getByText('No physical surfaces are currently available')).toBeInTheDocument()
    expect(screen.getByText('The shared surface inventory did not return any unit records for this workspace.')).toBeInTheDocument()
  })
})
