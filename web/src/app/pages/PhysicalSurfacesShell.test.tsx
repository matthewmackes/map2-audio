import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockEnrichedPhysicalSurfacesApi = {
  getSummary: jest.fn(async () => ({
    status: 'ok',
    summary: {
      stack_name: 'Enriched_MIDI_Physical_Surfaces',
      summary_generated_at: '2026-04-07T16:05:00Z',
      shared_operator_contract: {
        primary_role: 'synth_control',
        sub_menu_policy: 'non-synth-functions-live-in-submenus',
        multi_synth_mode: 'parallel',
        page_layout_mode: 'fixed-zones-per-family',
        view_sync: 'independent-per-surface',
        target_follow_policy: 'follow-most-recently-touched-or-armed',
        snapshot_strategy: 'external-midi-program-control-passthrough',
        community_firmware_support: 'first-class',
        surface_lab_mode: 'integrated-per-device',
      },
      host_observations: {
        usb_devices: [{ vendor_id: '17cc', product_id: '0808', product: 'Maschine Controller' }],
        sound_cards: [{ card_index: 3, alsa_id: 'MaschineControl', product: 'Maschine Controller', has_midi: true }],
        midi_hub_devices: [
          {
            device_id: 'maschine_mk1:map2_maschine_mk1',
            profile_id: 'maschine_mk1',
            profile_name: 'Maschine MK1',
            port_names: ['MAP2:Maschine-MK1'],
            connected: true,
          },
        ],
        python_modules: { hid: false, rtmidi: true },
        maschinen_mk1_host_note: 'Maschine is visible through snd-usb-caiaq and ALSA MIDI on this host.',
      },
      units: [
        {
          unit_id: 'maschine-mk1',
          display_name: 'Native Instruments Maschine MK1',
          family: 'maschine',
          device_type: 'hybrid_surface',
          specialized_route: '/maschine',
          host_detected: true,
          status: 'detected',
          status_reason: 'USB hardware is present on this host.',
          capabilities: ['pads', 'encoders', 'LED feedback', 'dual LCD'],
          integration_notes: ['Prefer a hybrid path.'],
          transport_layers: [
            {
              layer_id: 'alsa-midi',
              label: 'ALSA MIDI',
              kind: 'midi',
              status: 'online',
              detail: 'Kernel host path is available through ALSA MIDI.',
            },
            {
              layer_id: 'vendor-bulk-feedback',
              label: 'Vendor USB feedback',
              kind: 'feedback',
              status: 'attention',
              detail: 'Rich feedback still needs a shared transport adaptation.',
            },
          ],
          matched_usb_devices: [{ vendor_id: '17cc', product_id: '0808', product: 'Maschine Controller' }],
          matched_sound_cards: [{ card_index: 3, alsa_id: 'MaschineControl', product: 'Maschine Controller', has_midi: true }],
          matched_midi_devices: [
            {
              device_id: 'maschine_mk1:map2_maschine_mk1',
              profile_id: 'maschine_mk1',
              profile_name: 'Maschine MK1',
              port_names: ['MAP2:Maschine-MK1'],
              connected: true,
            },
          ],
          service_state: {
            daemon_connected: false,
            websocket_connected: false,
            audio_grid: { selected_block_id: 'node-1' },
          },
          firmware_posture: {
            status: 'official-ni-downloads-plus-legacy-midi-templates',
            detail: 'Native Instruments still publishes MK1 downloads.',
          },
          view_state: {
            page_layout_mode: 'fixed-zones-per-family',
            view_sync: 'independent-per-surface',
            target_follow_policy: 'follow-most-recently-touched-or-armed',
            current_view_id: 'synth-parameters-primary',
            current_view_label: 'Primary Synth Parameters',
            current_view_source: 'maschine-audio-grid-selection',
            views: [
              {
                view_id: 'synth-parameters-primary',
                label: 'Primary Synth Parameters',
                category: 'synth_control',
                note: 'Primary parameter bank.',
                presentation: { focus_mode: 'auto-follow-most-recent-target' },
                zones: [
                  {
                    zone_id: 'encoder-row',
                    label: 'Encoder Row',
                    role: 'primary parameter edit',
                    controls: ['encoders-1-8'],
                  },
                ],
              },
              {
                view_id: 'surface-lab',
                label: 'Surface Lab',
                category: 'advanced',
                note: 'Advanced diagnostics.',
                presentation: { focus_mode: 'manual' },
                zones: [
                  {
                    zone_id: 'diagnostic-grid',
                    label: 'Pad Matrix',
                    role: 'diagnostics',
                    controls: ['pads-1-16'],
                  },
                ],
              },
            ],
          },
          surface_lab: {
            enabled: true,
            access: 'integrated-advanced-mode',
            features: ['raw-midi-monitor', 'firmware-flasher'],
          },
        },
        {
          unit_id: 'mackie-mcu-pro',
          display_name: 'Mackie MCU Pro',
          family: 'mcu-pro',
          device_type: 'mcu_surface',
          specialized_route: null,
          host_detected: false,
          status: 'planned',
          status_reason: 'No matching hardware is currently visible on this host.',
          capabilities: ['motor faders', 'VPots', 'scribble strips'],
          integration_notes: ['MCU Pro should live behind an MCU protocol branch.'],
          transport_layers: [
            {
              layer_id: 'mcu-protocol',
              label: 'MCU protocol',
              kind: 'midi',
              status: 'planned',
              detail: 'Planned for the shared surface stack.',
            },
          ],
          matched_usb_devices: [],
          matched_sound_cards: [],
          matched_midi_devices: [],
          service_state: {},
          firmware_posture: {
            status: 'official-midi-file-updater',
            detail: 'Expose protocol support and an explicit maintenance path for updates.',
          },
          view_state: {
            page_layout_mode: 'fixed-zones-per-family',
            view_sync: 'independent-per-surface',
            target_follow_policy: 'follow-most-recently-touched-or-armed',
            current_view_id: 'current-view-mix',
            current_view_label: 'Current View Mix',
            current_view_source: 'current-view-policy',
            views: [
              {
                view_id: 'current-view-mix',
                label: 'Current View Mix',
                category: 'synth_control',
                note: 'Motor faders follow the current view.',
                presentation: { focus_mode: 'auto-follow-most-recent-target' },
                zones: [
                  {
                    zone_id: 'faders',
                    label: 'Motor Faders',
                    role: 'current-view continuous control',
                    controls: ['faders-1-8', 'master-fader'],
                  },
                ],
              },
            ],
          },
          surface_lab: {
            enabled: true,
            access: 'integrated-advanced-mode',
            features: ['mcu-protocol-inspector', 'motor-fader-safety-tools'],
          },
        },
      ],
    },
  })),
  setUnitView: jest.fn(async (surfaceId: string, viewId: string | null) => ({
    status: 'ok',
    unit: {
      unit_id: surfaceId,
      view_state: {
        current_view_id: viewId,
      },
    },
  })),
}

jest.mock('../../map2/clients/enrichedPhysicalSurfaces', () => ({
  enrichedPhysicalSurfacesApi: mockEnrichedPhysicalSurfacesApi,
}))

jest.mock('../theme', () => ({
  useTheme: () => ({
    theme: { carbonTheme: 'g100' },
    themeId: 'default',
    setTheme: jest.fn(),
    themes: {},
  }),
}))

const { PhysicalSurfacesShell } =
  jest.requireActual('./PhysicalSurfacesShell') as typeof import('./PhysicalSurfacesShell')
const { PhysicalSurfacesOverviewPage } =
  jest.requireActual('./PhysicalSurfacesOverviewPage') as typeof import('./PhysicalSurfacesOverviewPage')
const { PhysicalSurfaceUnitPage } =
  jest.requireActual('./PhysicalSurfaceUnitPage') as typeof import('./PhysicalSurfaceUnitPage')

function renderShell(initialEntry = '/physical-surfaces') {
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
          <Route path="/physical-surfaces/*" element={<PhysicalSurfacesShell />}>
            <Route index element={<PhysicalSurfacesOverviewPage />} />
            <Route path=":surfaceId" element={<PhysicalSurfaceUnitPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PhysicalSurfacesShell', () => {
  beforeEach(() => {
    mockEnrichedPhysicalSurfacesApi.getSummary.mockClear()
    mockEnrichedPhysicalSurfacesApi.setUnitView.mockClear()
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

  it('renders the overview workspace with the shared stack name and unit cards', async () => {
    renderShell('/physical-surfaces')

    expect(await screen.findByText('Enriched_MIDI_Physical_Surfaces')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Native Instruments Maschine MK1' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Mackie MCU Pro' })).toBeTruthy()
    expect(await screen.findByText('MIDI Hub Devices')).toBeTruthy()
    expect(await screen.findByText('Synth-first surface rules')).toBeTruthy()
    expect(await screen.findByText(/snd-usb-caiaq/i)).toBeTruthy()
  })

  it('renders an individual unit page with transport and firmware posture', async () => {
    renderShell('/physical-surfaces/maschine-mk1')

    expect(await screen.findByRole('heading', { name: 'Native Instruments Maschine MK1' })).toBeTruthy()
    expect(screen.getByText('Transport layers')).toBeTruthy()
    expect(screen.getByText('Vendor USB feedback')).toBeTruthy()
    expect(screen.getByText('official-ni-downloads-plus-legacy-midi-templates')).toBeTruthy()
    expect(screen.getByText('Per-family page model')).toBeTruthy()
    expect(screen.getByText('Advanced tooling')).toBeTruthy()
    expect(screen.getByText('Matched MIDI Hub devices')).toBeTruthy()
    expect(screen.getByText('Maschine MK1 • MAP2:Maschine-MK1')).toBeTruthy()
  })

  it('sends a view override when the operator selects a fixed view', async () => {
    renderShell('/physical-surfaces/maschine-mk1')

    expect(await screen.findByRole('heading', { name: 'Native Instruments Maschine MK1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use View' }))

    await waitFor(() => {
      expect(mockEnrichedPhysicalSurfacesApi.setUnitView).toHaveBeenCalledWith('maschine-mk1', 'surface-lab')
    })
  })
})
