/**
 * T2503 Set 10 — MultiTrack Recorder shell + sub-area mount tests.
 *
 * Each describe block mounts the shell through a memory router with the
 * full route tree, navigates to a sub-area, and asserts the page rendered
 * its hero text. Mutations + WebSocket / queries are stubbed via the
 * `daw` client mock.
 */
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Suspense } from 'react'

import { MultiTrackRecorderShell } from './MultiTrackRecorderShell'
import { useDawProjectStore } from '../stores/dawProjectStore'
import { MultiTrackTransportPage } from './multitrack-recorder/MultiTrackTransportPage'
import { MultiTrackTracksPage } from './multitrack-recorder/MultiTrackTracksPage'
import { MultiTrackMixerPage } from './multitrack-recorder/MultiTrackMixerPage'
import { MultiTrackClipsPage } from './multitrack-recorder/MultiTrackClipsPage'
import { MultiTrackPluginsPage } from './multitrack-recorder/MultiTrackPluginsPage'
import { MultiTrackAutomationPage } from './multitrack-recorder/MultiTrackAutomationPage'
import { MultiTrackSessionsPage } from './multitrack-recorder/MultiTrackSessionsPage'
import { MultiTrackExportPage } from './multitrack-recorder/MultiTrackExportPage'

// --- Mocks ---

jest.mock('@/app/layout/useSetShellWindow', () => ({
  useSetShellWindow: () => undefined,
}))

jest.mock('@/app/hooks/useNodePageContext', () => ({
  useNodePageContext: () => ({
    localNode: { node_id: 'local', hostname: 'localhost' },
    topology: undefined,
    topologyNodes: [],
    viewedNode: { node_id: 'local', hostname: 'localhost' },
    viewedNodeId: 'local',
  }),
}))

jest.mock('@/app/theme', () => ({
  toCarbonBaseTheme: () => 'g100',
  useTheme: () => ({ theme: { carbonTheme: 'g100' } }),
}))

// VU-meter hook reaches WebSocket transport in production; in tests we
// substitute a no-op shape per the CLAUDE.md gotcha note.
jest.mock('@/app/hooks/useVuMeters', () => ({
  __esModule: true,
  default: () => ({
    levels: {},
    peakHold: {},
    isConnected: false,
    isRunning: false,
    resetPeaks: () => {},
  }),
}))

const mockGetMode = jest.fn()
const mockPlay = jest.fn()
const mockStop = jest.fn()
const mockSetRecord = jest.fn()
const mockSetPosition = jest.fn()
const mockCreateTrack = jest.fn()
const mockDeleteTrack = jest.fn()
const mockSetTrackArm = jest.fn()
const mockAddClip = jest.fn()
const mockRemoveClip = jest.fn()
const mockAddPluginToTrack = jest.fn()
const mockRemovePluginFromTrack = jest.fn()
const mockSetAutomationPoint = jest.fn()
const mockNewProject = jest.fn()
const mockLoadProject = jest.fn()
const mockSaveProject = jest.fn()
const mockSetMode = jest.fn()

const mockOpenStream = jest.fn(() => ({ close: jest.fn() }))

jest.mock('@/map2/clients/daw', () => ({
  dawApi: {
    getMode: (...args: any[]) => mockGetMode(...args),
    setMode: (...args: any[]) => mockSetMode(...args),
    play: (...args: any[]) => mockPlay(...args),
    stop: (...args: any[]) => mockStop(...args),
    setRecord: (...args: any[]) => mockSetRecord(...args),
    setPosition: (...args: any[]) => mockSetPosition(...args),
    createTrack: (...args: any[]) => mockCreateTrack(...args),
    deleteTrack: (...args: any[]) => mockDeleteTrack(...args),
    setTrackArm: (...args: any[]) => mockSetTrackArm(...args),
    addClip: (...args: any[]) => mockAddClip(...args),
    removeClip: (...args: any[]) => mockRemoveClip(...args),
    addPluginToTrack: (...args: any[]) => mockAddPluginToTrack(...args),
    removePluginFromTrack: (...args: any[]) => mockRemovePluginFromTrack(...args),
    setAutomationPoint: (...args: any[]) => mockSetAutomationPoint(...args),
    newProject: (...args: any[]) => mockNewProject(...args),
    loadProject: (...args: any[]) => mockLoadProject(...args),
    saveProject: (...args: any[]) => mockSaveProject(...args),
  },
  openDawEventStream: (...args: any[]) => mockOpenStream(...args),
}))

const mockListPlugins = jest.fn()
jest.mock('@/map2/clients/pluginInventory', () => ({
  pluginInventoryApi: {
    list: (...args: any[]) => mockListPlugins(...args),
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderShell(initialEntry: string) {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={makeClient()}>
        <Suspense fallback={<div>loading</div>}>
          <Routes>
            <Route path="/multitrack-recorder/*" element={<MultiTrackRecorderShell />}>
              <Route index element={<Navigate to="transport" replace />} />
              <Route path="transport" element={<MultiTrackTransportPage />} />
              <Route path="tracks" element={<MultiTrackTracksPage />} />
              <Route path="mixer" element={<MultiTrackMixerPage />} />
              <Route path="clips" element={<MultiTrackClipsPage />} />
              <Route path="plugins" element={<MultiTrackPluginsPage />} />
              <Route path="automation" element={<MultiTrackAutomationPage />} />
              <Route path="sessions" element={<MultiTrackSessionsPage />} />
              <Route path="export" element={<MultiTrackExportPage />} />
            </Route>
          </Routes>
        </Suspense>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  // Reset the in-memory project store so each test starts from a
  // known-empty state (the store is a module-level singleton).
  useDawProjectStore.getState().reset()
  mockGetMode.mockResolvedValue({
    mode: 'daw',
    state: 'running',
    daw_mode_available: true,
    last_error: null,
  })
  mockListPlugins.mockResolvedValue({
    plugins: [
      { uri: 'urn:test:reverb-1', name: 'Test Hall Reverb', category: 'reverb', format: 'lv2' },
      { uri: 'urn:test:eq-1', name: 'Test 3-Band EQ', category: 'eq', format: 'native' },
    ],
  })
})

describe('MultiTrackRecorderShell', () => {
  it('mounts the shell and renders the tab nav', async () => {
    renderShell('/multitrack-recorder/transport')
    await waitFor(() => expect(screen.getByTestId('multitrack-recorder-shell')).toBeInTheDocument())
    expect(screen.getByTestId('multitrack-tab-transport')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-tracks')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-mixer')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-clips')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-plugins')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-automation')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-sessions')).toBeInTheDocument()
    expect(screen.getByTestId('multitrack-tab-export')).toBeInTheDocument()
  })

  it('opens the event stream once on mount', async () => {
    renderShell('/multitrack-recorder/transport')
    await waitFor(() => expect(mockOpenStream).toHaveBeenCalled())
  })

  it('renders the flag-OFF banner when daw mode is disabled at build time', async () => {
    mockGetMode.mockResolvedValue({
      mode: 'live',
      state: 'idle',
      daw_mode_available: false,
      last_error: null,
    })
    renderShell('/multitrack-recorder/transport')
    await waitFor(() =>
      expect(screen.getByTestId('multitrack-recorder-flag-off')).toBeInTheDocument(),
    )
  })

  it('renders the Transport sub-area', async () => {
    renderShell('/multitrack-recorder/transport')
    await waitFor(() => expect(screen.getByTestId('daw-transport-play')).toBeInTheDocument())
  })

  it('renders the Tracks sub-area', async () => {
    renderShell('/multitrack-recorder/tracks')
    await waitFor(() => expect(screen.getByTestId('daw-create-track')).toBeInTheDocument())
    expect(screen.getByTestId('daw-tracks-empty')).toBeInTheDocument()
  })

  it('renders the Mixer sub-area (empty state)', async () => {
    renderShell('/multitrack-recorder/mixer')
    await waitFor(() => expect(screen.getByTestId('daw-mixer-empty')).toBeInTheDocument())
  })

  it('renders the Clips sub-area pad grid', async () => {
    renderShell('/multitrack-recorder/clips')
    await waitFor(() => expect(screen.getByTestId('daw-clip-pad-grid')).toBeInTheDocument())
    // 16 pads
    for (let i = 0; i < 16; i += 1) {
      expect(screen.getByTestId(`daw-clip-pad-${i}`)).toBeInTheDocument()
    }
  })

  it('renders the Plugins sub-area inventory', async () => {
    renderShell('/multitrack-recorder/plugins')
    await waitFor(() => expect(screen.getByTestId('daw-plugin-filter')).toBeInTheDocument())
    await waitFor(() => expect(mockListPlugins).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByTestId('daw-plugin-add-urn:test:reverb-1')).toBeInTheDocument(),
    )
  })

  it('renders the Automation sub-area', async () => {
    renderShell('/multitrack-recorder/automation')
    await waitFor(() => expect(screen.getByTestId('daw-add-lane')).toBeInTheDocument())
  })

  it('renders the Sessions sub-area', async () => {
    renderShell('/multitrack-recorder/sessions')
    await waitFor(() => expect(screen.getByTestId('daw-new-project')).toBeInTheDocument())
    expect(screen.getByTestId('daw-load-project')).toBeInTheDocument()
    expect(screen.getByTestId('daw-save-project')).toBeInTheDocument()
  })

  it('renders the Export sub-area placeholder', async () => {
    renderShell('/multitrack-recorder/export')
    await waitFor(() =>
      expect(screen.getByText(/Offline render \/ bounce \/ stem/)).toBeInTheDocument(),
    )
  })

  it('redirects /multitrack-recorder index to /transport', async () => {
    renderShell('/multitrack-recorder')
    await waitFor(() => expect(screen.getByTestId('daw-transport-play')).toBeInTheDocument())
  })
})
