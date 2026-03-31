import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { PushSurfacePage } from './PushSurfacePage'

jest.mock('../../assets/Abiliton-Push-Render.png', () => 'Abiliton-Push-Render.png')

jest.mock('../../map2/clients/pushSurface', () => ({
  pushSurfaceApi: {
    getLabsEditorState: jest.fn(),
    saveLabsEditorState: jest.fn(),
    getState: jest.fn(),
  },
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => ({
    viewedNodeId: 'node-a',
    viewedNode: {
      node_id: 'node-a',
      hostname: 'MAP2-A',
      display_label: 'Main Rig',
      role: 'all_in_one',
      status: 'ok',
      is_local: true,
      is_viewed: true,
      cpu_percent: 12,
      memory_percent: 38,
      xrun_count: 0,
      audio_latency_ms: 4.4,
      services: {
        backend: true,
        juce_engine: true,
        pipewire: true,
      },
      last_seen: '2026-03-31T13:00:00Z',
    },
  }),
}))

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => ({
    isClusterMode: true,
  }),
}))

jest.mock('../hooks/useLatencyPressure', () => ({
  useLatencyPressure: () => ({
    scoreDisplay: '08',
    status: 'stable',
    statusLabel: 'Stable',
    helperText: 'Score 08/10 · RTL p95 4.20 ms · Callback 41% of budget',
    cpuMetrics: {
      totalCpuPercent: 18.4,
    },
  }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const { pushSurfaceApi } = jest.requireMock('../../map2/clients/pushSurface') as {
  pushSurfaceApi: {
    getLabsEditorState: jest.Mock
    saveLabsEditorState: jest.Mock
    getState: jest.Mock
  }
}

const welcomeRoutines = [
  {
    id: 'map2-blue-cross',
    name: 'MAP2 Blue Cross Welcome',
    description: 'Primary routine',
    category: 'welcome',
    is_example: false,
    run_on_connect: true,
    duration_ms: 7000,
    handoff_page: 'home',
    steps: [
      {
        id: 'intro',
        duration_ms: 2000,
        pad_lights: {
          grid_0_0: { color: 'BLUE', pulse: true },
        },
        display: {
          title: 'WELCOME',
          lines: ['{node_name}', '{firmware_profile}', 'Score {node_score}/10', '{cluster_status}'],
        },
      },
    ],
  },
  ...Array.from({ length: 10 }, (_value, index) => ({
    id: `example-${index + 1}`,
    name: `Example ${index + 1}`,
    description: `Example routine ${index + 1}`,
    category: 'animation',
    is_example: true,
    run_on_connect: false,
    duration_ms: 1000,
    handoff_page: 'home',
    steps: [
      {
        id: `step-${index + 1}`,
        duration_ms: 250,
        pad_lights: {},
        display: {
          title: `EXAMPLE ${index + 1}`,
          lines: ['Preview'],
        },
      },
    ],
  })),
]

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PushSurfacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PushSurfacePage', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    pushSurfaceApi.getLabsEditorState.mockResolvedValue({
      status: 'ok',
      editor_state: {
        schema_version: 1,
        assignments: [
          {
            id: 'qa-1',
            control_id: 'btn_01',
            control_label: 'Tap Tempo',
            interaction: 'tap',
            assignment_type: 'cc',
            label: 'Tap Tempo CC',
            device_scope: 'device:auto',
            cluster_scope: 'node-a',
            payload: { midi_channel: 1, cc: 64, value: 127 },
            enabled: true,
            safe_mode_confirm: true,
          },
          {
            id: 'qa-2',
            control_id: 'btn_19',
            control_label: 'Record',
            interaction: 'tap',
            assignment_type: 'pc',
            label: 'Snapshot Program Change',
            device_scope: 'device:auto',
            cluster_scope: 'node-a',
            payload: { midi_channel: 1, program: 4 },
            enabled: true,
            safe_mode_confirm: true,
          },
          {
            id: 'qa-3',
            control_id: 'grid_0_0',
            control_label: 'PAD 1,1',
            interaction: 'velocity',
            assignment_type: 'note',
            label: 'Chord Trigger',
            device_scope: 'device:auto',
            cluster_scope: 'node-a',
            payload: { midi_channel: 1, note: 60, velocity: 127 },
            enabled: true,
            safe_mode_confirm: false,
          },
        ],
        welcome_routines: welcomeRoutines,
        selected_welcome_routine_id: 'map2-blue-cross',
      },
      quick_assignments: [],
      selected_welcome_routine: welcomeRoutines[0],
      active_device: {
        device_id: 'push2-001',
        input_port_name: 'Ableton Push 2 Input',
        output_port_name: 'Ableton Push 2 Output',
        profile: {
          profile_id: 'push2',
          display_name: 'Ableton Push 2',
        },
      },
      manager_running: true,
    })
    pushSurfaceApi.getState.mockResolvedValue({
      status: 'ok',
      snapshot: {
        running: true,
        active_page: 'home',
        state: {
          presets: [
            { id: 'preset-1', name: 'Main Snapshot', is_active: true, selected: true },
          ],
        },
      },
    })
    pushSurfaceApi.saveLabsEditorState.mockResolvedValue({
      status: 'ok',
      editor_state: {
        schema_version: 1,
        assignments: [],
        welcome_routines: welcomeRoutines,
        selected_welcome_routine_id: 'map2-blue-cross',
      },
      quick_assignments: [],
      selected_welcome_routine: welcomeRoutines[0],
      active_device: null,
      manager_running: true,
    })
  })

  it('renders the Push labs editor, quick assignments, and seeded welcome examples', async () => {
    renderPage()

    expect(await screen.findByText('Standalone Push WYSIWYG editor for mappings, welcome routines, and live surface management.')).toBeTruthy()
    expect(await screen.findByText('Tap Tempo CC')).toBeTruthy()
    expect(await screen.findByText('Snapshot Program Change')).toBeTruthy()
    expect(await screen.findByText('10 seeded')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('MAP2-A (Main Rig)').length).toBeGreaterThan(0))
  })

  it('opens the inline hotspot popover editor for a mapped control', async () => {
    renderPage()

    fireEvent.click(await screen.findByText('Tap Tempo CC'))

    await waitFor(() => expect(screen.getByTestId('labs-control-popover')).toBeTruthy())
    expect(screen.getByDisplayValue('Tap Tempo CC')).toBeTruthy()
    expect(screen.getByText('Safe-mode confirmation')).toBeTruthy()
  })

  it('lets operators switch into routine paint mode', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Paint routine' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Paint routine' }))

    expect(await screen.findByText('Apply blue cross')).toBeTruthy()
    expect(screen.getByText('Clear lights')).toBeTruthy()
    expect(screen.getByTestId('labs-step-list')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Labs' })).toBeTruthy()
  })

  it('keeps the current surface content visible during reload', async () => {
    renderPage()

    expect(await screen.findByText('Tap Tempo CC')).toBeTruthy()
    expect(screen.getByText('Snapshot Program Change')).toBeTruthy()

    let resolveReload: ((value: Awaited<ReturnType<typeof pushSurfaceApi.getLabsEditorState>>) => void) | null = null
    pushSurfaceApi.getLabsEditorState.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveReload = resolve
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(screen.getByText('Tap Tempo CC')).toBeTruthy()
    expect(screen.getByText('Snapshot Program Change')).toBeTruthy()
    expect(screen.queryByText('Loading Labs Push editor')).toBeNull()

    resolveReload?.({
      status: 'ok',
      editor_state: {
        schema_version: 1,
        assignments: [
          {
            id: 'qa-1',
            control_id: 'btn_01',
            control_label: 'Tap Tempo',
            interaction: 'tap',
            assignment_type: 'cc',
            label: 'Tap Tempo CC',
            device_scope: 'device:auto',
            cluster_scope: 'node-a',
            payload: { midi_channel: 1, cc: 64, value: 127 },
            enabled: true,
            safe_mode_confirm: true,
          },
        ],
        welcome_routines: welcomeRoutines,
        selected_welcome_routine_id: 'map2-blue-cross',
      },
      quick_assignments: [],
      selected_welcome_routine: welcomeRoutines[0],
      active_device: {
        device_id: 'push2-001',
        input_port_name: 'Ableton Push 2 Input',
        output_port_name: 'Ableton Push 2 Output',
        profile: {
          profile_id: 'push2',
          display_name: 'Ableton Push 2',
        },
      },
      manager_running: true,
    })

    await waitFor(() => expect(screen.getByText('Tap Tempo CC')).toBeTruthy())
  })
})
