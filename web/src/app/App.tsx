import React, { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DataTableSkeleton, SkeletonPlaceholder, SkeletonText } from '@carbon/react'
import { AppShell } from './layout/AppShell'
import { Map2BrandMark } from './components/branding/map2Branding'
import { ViewportPolicyGate } from './components/ViewportPolicyGate'
import { ToastProvider, useToasts } from './components/Toasts'
import ErrorBoundary from './components/ErrorBoundary'
import { ClusterProvider } from './contexts/ClusterContext'
import { useWebSocketConnection } from '../map2/hooks/useWebSocket'
import { buildLegacyPlatformRedirectPath, buildPlatformWorkspacePath } from './platform/routes'
import { useHomePlatformStatus } from './hooks/useHomePlatformStatus'
import { LoadingState } from './components/shared/LoadingState'

// Lazy-load devtools so they don't bloat the production shell chunk
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools }))
)

// ============================================================================
// Route-level code splitting — each page is a separate async chunk.
// Only the code for the current route is downloaded; the rest load on demand.
// ============================================================================
const HomePage              = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const ChainsPage            = lazy(() => import('./pages/ChainsPage').then(m => ({ default: m.ChainsPage })))
const LegacyPage            = lazy(() => import('./pages/LegacyPage').then(m => ({ default: m.LegacyPage })))
const AudioArtifactsPage    = lazy(() => import('./pages/AudioArtifactsPage').then(m => ({ default: m.AudioArtifactsPage })))
const PlatformWorkspacePage = lazy(() => import('./pages/PlatformWorkspacePage').then(m => ({ default: m.PlatformWorkspacePage })))
const PlatformWorkspaceSection = lazy(() => import('./pages/workspace-hub/platforms/PlatformWorkspaceSection').then(m => ({ default: m.PlatformWorkspaceSection })))
const WorkspacePhysicalSurfacesOutlet = lazy(() => import('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet').then(m => ({ default: m.WorkspacePhysicalSurfacesOutlet })))
const WorkspacePhysicalSurfacesOverviewPage = lazy(() => import('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOverviewPage').then(m => ({ default: m.WorkspacePhysicalSurfacesOverviewPage })))
const WorkspacePhysicalSurfaceUnitPage = lazy(() => import('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfaceUnitPage').then(m => ({ default: m.WorkspacePhysicalSurfaceUnitPage })))
const WorkspaceOutboardHardwareOutlet = lazy(() => import('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareOutlet').then(m => ({ default: m.WorkspaceOutboardHardwareOutlet })))
const WorkspaceOutboardHardwareOverviewPage = lazy(() => import('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareOverviewPage').then(m => ({ default: m.WorkspaceOutboardHardwareOverviewPage })))
const WorkspaceOutboardHardwareDevicePage = lazy(() => import('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareDevicePage').then(m => ({ default: m.WorkspaceOutboardHardwareDevicePage })))
const WorkspaceHubShell = lazy(() => import('./pages/WorkspaceHubShell').then(m => ({ default: m.WorkspaceHubShell })))
const WorkspaceHubIndexRedirect = lazy(() => import('./pages/WorkspaceHubShell').then(m => ({ default: m.WorkspaceHubIndexRedirect })))
const WorkspaceHubPlaceholder = lazy(() => import('./pages/WorkspaceHubShell').then(m => ({ default: m.WorkspaceHubPlaceholder })))
const PushSurfacePage       = lazy(() => import('./pages/PushSurfacePage').then(m => ({ default: m.PushSurfacePage })))
const MaschinePage          = lazy(() => import('./pages/MaschinePage').then(m => ({ default: m.MaschinePage })))
const McuPage               = lazy(() => import('./pages/McuPage').then(m => ({ default: m.McuPage })))
const LaunchControlPage     = lazy(() => import('./pages/LaunchControlPage').then(m => ({ default: m.LaunchControlPage })))
const MidiCommanderPage     = lazy(() => import('./pages/MidiCommanderPage').then(m => ({ default: m.MidiCommanderPage })))
const PhysicalSurfacesShell = lazy(() => import('./pages/PhysicalSurfacesShell').then(m => ({ default: m.PhysicalSurfacesShell })))
const PhysicalSurfacesOverviewPage = lazy(() => import('./pages/PhysicalSurfacesOverviewPage').then(m => ({ default: m.PhysicalSurfacesOverviewPage })))
const PhysicalSurfaceUnitPage = lazy(() => import('./pages/PhysicalSurfaceUnitPage').then(m => ({ default: m.PhysicalSurfaceUnitPage })))
const OutboardHardwareShell = lazy(() => import('./pages/OutboardHardwareShell').then(m => ({ default: m.OutboardHardwareShell })))
const OutboardHardwareOverviewPage = lazy(() => import('./pages/OutboardHardwareOverviewPage').then(m => ({ default: m.OutboardHardwareOverviewPage })))
const OutboardHardwareDevicePage = lazy(() => import('./pages/OutboardHardwareDevicePage').then(m => ({ default: m.OutboardHardwareDevicePage })))
const MidiHubShell          = lazy(() => import('./pages/MidiHubShell').then(m => ({ default: m.MidiHubShell })))
const MidiHubConnectionsPage = lazy(() => import('./pages/midi-hub/MidiHubConnectionsPage').then(m => ({ default: m.MidiHubConnectionsPage })))
const MidiHubPresetsPage    = lazy(() => import('./pages/midi-hub/MidiHubPresetsPage').then(m => ({ default: m.MidiHubPresetsPage })))
const MidiHubTransportPage  = lazy(() => import('./pages/midi-hub/MidiHubTransportPage').then(m => ({ default: m.MidiHubTransportPage })))
const MidiHubEventsPage     = lazy(() => import('./pages/midi-hub/MidiHubEventsPage').then(m => ({ default: m.MidiHubEventsPage })))
const MidiHubProcessingPage = lazy(() => import('./pages/midi-hub/MidiHubProcessingPage').then(m => ({ default: m.MidiHubProcessingPage })))
const MidiHubNetworkPage    = lazy(() => import('./pages/midi-hub/MidiHubNetworkPage').then(m => ({ default: m.MidiHubNetworkPage })))
const MidiHubLabPage        = lazy(() => import('./pages/midi-hub/MidiHubLabPage').then(m => ({ default: m.MidiHubLabPage })))
const SnapshotEditorPage    = lazy(() => import('./pages/SnapshotEditorPageContent').then(m => ({ default: m.SnapshotEditorPage })))
const SnapshotPublishPage   = lazy(() => import('./pages/SnapshotPublishPage').then(m => ({ default: m.SnapshotPublishPage })))
const DSPPage               = lazy(() => import('./pages/DSPPage').then(m => ({ default: m.DSPPage })))
const EdirolUA1000Page      = lazy(() => import('./pages/EdirolUA1000Page').then(m => ({ default: m.EdirolUA1000Page })))
const HoToneJoGGPage        = lazy(() => import('./pages/HoToneJoGGPage').then(m => ({ default: m.HoToneJoGGPage })))
const MOTURMEPage           = lazy(() => import('./pages/MOTURMEPage'))
const CPUPerformancePage    = lazy(() => import('./pages/CPUPerformancePage'))
const WelcomePage           = lazy(() => import('./pages/WelcomePage').then(m => ({ default: m.WelcomePage })))
const LCDPage               = lazy(() => import('./pages/LCDPage').then(m => ({ default: m.LCDPage })))
const PerformanceBrainPage  = lazy(() => import('./pages/PerformanceBrainPage').then(m => ({ default: m.PerformanceBrainPage })))
const MeteringPage          = lazy(() => import('./pages/MeteringPage').then(m => ({ default: m.MeteringPage })))
const PipeWirePage          = lazy(() => import('./pages/PipeWirePage').then(m => ({ default: m.PipeWirePage })))
const TesiraPage            = lazy(() => import('./pages/TesiraPage').then(m => ({ default: m.TesiraPage })))
const MPX1Page              = lazy(() => import('./pages/MPX1Page').then(m => ({ default: m.MPX1Page })))
const MPX1PanelView         = lazy(() => import('./pages/MPX1PanelView').then(m => ({ default: m.MPX1PanelView })))
const MPX1EditorView        = lazy(() => import('./pages/MPX1EditorView').then(m => ({ default: m.MPX1EditorView })))
const MPX1MidiMapView       = lazy(() => import('./pages/MPX1MidiMapView').then(m => ({ default: m.MPX1MidiMapView })))
const MPX1MatrixView        = lazy(() => import('./pages/MPX1MatrixView').then(m => ({ default: m.MPX1MatrixView })))
const MPX1LibraryView       = lazy(() => import('./pages/MPX1LibraryView').then(m => ({ default: m.MPX1LibraryView })))
const MPX1DiagView          = lazy(() => import('./pages/MPX1DiagView').then(m => ({ default: m.MPX1DiagView })))
const MPX1PerformView       = lazy(() => import('./pages/MPX1PerformView').then(m => ({ default: m.MPX1PerformView })))
const MPX1FlowView          = lazy(() => import('./pages/MPX1FlowView').then(m => ({ default: m.MPX1FlowView })))
const IntelFXPage           = lazy(() => import('./pages/IntelFXPage').then(m => ({ default: m.IntelFXPage })))
const IntelFXPanelView      = lazy(() => import('./pages/IntelFXPanelView').then(m => ({ default: m.IntelFXPanelView })))
const IntelFXEditorView     = lazy(() => import('./pages/IntelFXEditorView').then(m => ({ default: m.IntelFXEditorView })))
const IntelFXMidiMapView    = lazy(() => import('./pages/IntelFXMidiMapView').then(m => ({ default: m.IntelFXMidiMapView })))
const IntelFXLibraryView    = lazy(() => import('./pages/IntelFXLibraryView').then(m => ({ default: m.IntelFXLibraryView })))
const IntelFXPerformView    = lazy(() => import('./pages/IntelFXPerformView').then(m => ({ default: m.IntelFXPerformView })))
const IntelFXMonitorView    = lazy(() => import('./pages/IntelFXMonitorView').then(m => ({ default: m.IntelFXMonitorView })))
const IntelFXFlowView       = lazy(() => import('./pages/IntelFXFlowView').then(m => ({ default: m.IntelFXFlowView })))
const PerformPage           = lazy(() => import('./pages/PerformPage').then(m => ({ default: m.PerformPage })))
const ExpressionPage        = lazy(() => import('./pages/ExpressionPage').then(m => ({ default: m.ExpressionPage })))
const GroundControlProPage  = lazy(() => import('./pages/GroundControlProPage').then(m => ({ default: m.GroundControlProPage })))

function RouteLoadingState({ variant }: { variant: 'default' | 'snapshot' | 'midi-hub' | 'metrics' | 'audio-engine' }) {
  if (variant === 'snapshot') {
    return (
      <div style={{ padding: 24, display: 'grid', gap: 16 }}>
        <SkeletonText heading width="26%" />
        <SkeletonText paragraph lineCount={2} width="68%" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <SkeletonPlaceholder style={{ height: 180 }} />
          <SkeletonPlaceholder style={{ height: 180 }} />
          <SkeletonPlaceholder style={{ height: 180 }} />
        </div>
        <SkeletonPlaceholder style={{ height: 320 }} />
      </div>
    )
  }

  if (variant === 'midi-hub') {
    return (
      <div style={{ padding: 24, display: 'grid', gap: 16 }}>
        <SkeletonText heading width="22%" />
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          <SkeletonPlaceholder style={{ height: 540 }} />
          <div style={{ display: 'grid', gap: 16 }}>
            <SkeletonText paragraph lineCount={2} width="58%" />
            <DataTableSkeleton rowCount={6} columnCount={5} zebra={false} />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'metrics' || variant === 'audio-engine') {
    return (
      <div style={{ padding: 24, display: 'grid', gap: 16 }}>
        <SkeletonText heading width="24%" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <SkeletonPlaceholder style={{ height: 120 }} />
          <SkeletonPlaceholder style={{ height: 120 }} />
          <SkeletonPlaceholder style={{ height: 120 }} />
          <SkeletonPlaceholder style={{ height: 120 }} />
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <SkeletonPlaceholder style={{ height: 240 }} />
          <SkeletonPlaceholder style={{ height: 240 }} />
        </div>
      </div>
    )
  }

  return (
    <LoadingState description="Loading page content" variant="page" />
  )
}

function PageLoader() {
  const location = useLocation()
  const pathname = location.pathname

  const variant: 'default' | 'snapshot' | 'midi-hub' | 'metrics' | 'audio-engine' =
    pathname.startsWith('/snapshot-editor')
      || pathname.startsWith('/snapshots/')
      ? 'snapshot'
      : pathname.startsWith('/midi-hub')
        ? 'midi-hub'
        : pathname.startsWith('/metering')
          ? 'metrics'
          : pathname.startsWith('/engine') || pathname.startsWith('/pipewire') || pathname.startsWith('/dsp')
            ? 'audio-engine'
            : 'default'

  return <RouteLoadingState variant={variant} />
}

function RouteBoundary({
  children,
  title,
  actionLabel,
}: {
  children: React.ReactNode
  title: string
  actionLabel: string
}) {
  return (
    <ErrorBoundary
      title={title}
      message="This page hit a render or load error. Retry the view or reload the page."
      actionLabel={actionLabel}
    >
      {children}
    </ErrorBoundary>
  )
}

function HomeEntryRoute() {
  const location = useLocation()
  const redirectTarget = buildLegacyPlatformRedirectPath(new URLSearchParams(location.search))

  if (redirectTarget) {
    return <Navigate to={redirectTarget} replace />
  }

  return <HomePage />
}

function LegacyPlatformRedirect() {
  const location = useLocation()
  const redirectTarget = buildLegacyPlatformRedirectPath(new URLSearchParams(location.search))

  return <Navigate to={redirectTarget ?? buildPlatformWorkspacePath('overview')} replace />
}

function LegacyArtifactsRedirect({ defaultCategory }: { defaultCategory?: string }) {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  if (defaultCategory && !searchParams.has('category')) {
    searchParams.set('category', defaultCategory)
  }
  const nextSearch = searchParams.toString()
  return <Navigate to={nextSearch ? `/artifacts?${nextSearch}` : '/artifacts'} replace />
}

function LegacyStandalonePanelRedirect({ panel }: { panel: 'host-machine' | 'audio-engine' | 'theme' | 'about' }) {
  const location = useLocation()
  const search = location.search || ''
  return <Navigate to={`${buildPlatformWorkspacePath(panel)}${search}`} replace />
}

function PlatformStatusHeartbeat() {
  const location = useLocation()
  const isDesktopRoute = location.pathname === '/'

  useHomePlatformStatus({
    pollMs: isDesktopRoute ? 10_000 : 30_000,
    staleMs: isDesktopRoute ? 8_000 : 25_000,
  })

  return null
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

const RETRYING_TOAST_ID = 'backend-retrying'
const UNREACHABLE_TOAST_ID = 'backend-unreachable'

function BackendConnectionMonitor() {
  const { status, client } = useWebSocketConnection()
  const { pushToast, dismissToast } = useToasts()

  useEffect(() => {
    const unsubscribe = client.onReconnectExhausted(() => {
      dismissToast(RETRYING_TOAST_ID)
      pushToast('Backend unreachable - click to retry.', 'error', {
        id: UNREACHABLE_TOAST_ID,
        persistent: true,
        action: {
          label: 'Retry now',
          onClick: () => client.retryNow(),
        },
      })
    })

    return () => unsubscribe()
  }, [client, dismissToast, pushToast])

  useEffect(() => {
    if (status === 'connected') {
      dismissToast(RETRYING_TOAST_ID)
      dismissToast(UNREACHABLE_TOAST_ID)
      return
    }

    if (status === 'reconnecting') {
      dismissToast(UNREACHABLE_TOAST_ID)
      pushToast('Backend connection lost - retrying...', 'warn', {
        id: RETRYING_TOAST_ID,
        persistent: true,
      })
      return
    }

    dismissToast(RETRYING_TOAST_ID)
  }, [status, dismissToast, pushToast])

  return null
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ViewportPolicyGate>
        <BrowserRouter>
          <ClusterProvider>
            <ToastProvider>
              <PlatformStatusHeartbeat />
              <BackendConnectionMonitor />
              <ErrorBoundary title="MAP2 UI crashed" actionLabel="Try again">
                <div className="platform-brand-frame">
                  <div className="platform-brand-backdrop" aria-hidden="true">
                    <Map2BrandMark className="platform-brand-backdrop__mark platform-brand-backdrop__mark--primary" />
                    <Map2BrandMark className="platform-brand-backdrop__mark platform-brand-backdrop__mark--secondary" />
                  </div>
                  <div className="platform-brand-frame__content">
                    <Routes>
                    {/* Full-window routes — no AppShell chrome */}
                    <Route path="/perform" element={
                      <Suspense fallback={<PageLoader />}>
                        <PerformPage />
                      </Suspense>
                    } />
                    {/* All standard routes wrapped in AppShell */}
                    <Route
                      path="/*"
                      element={
                        <AppShell>
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                                <Route path="/" element={<HomeEntryRoute />} />
                                <Route path="/platform" element={<LegacyPlatformRedirect />} />
                                <Route path="/platforms" element={<Navigate to={buildPlatformWorkspacePath('overview')} replace />} />
                                <Route path="/platforms/workspace-catalog" element={<Navigate to={buildPlatformWorkspacePath('overview')} replace />} />
                                <Route path="/platforms/:workspace" element={<PlatformWorkspacePage />} />
                                <Route path="/workspace/*" element={<WorkspaceHubShell />}>
                                  <Route index element={<WorkspaceHubIndexRedirect />} />
                                  <Route
                                    path="platforms/:workspace"
                                    element={<PlatformWorkspaceSection />}
                                  />
                                  <Route
                                    path="physical-surfaces"
                                    element={<WorkspacePhysicalSurfacesOutlet />}
                                  >
                                    <Route index element={<WorkspacePhysicalSurfacesOverviewPage />} />
                                    <Route path=":surfaceId" element={<WorkspacePhysicalSurfaceUnitPage />} />
                                  </Route>
                                  <Route
                                    path="artifacts"
                                    element={<WorkspaceHubPlaceholder sectionKey="artifacts" title="Audio Artifacts" subtitle="Overview scaffold for the upcoming unified workspace hub." />}
                                  />
                                  <Route
                                    path="outboard-hardware"
                                    element={<WorkspaceOutboardHardwareOutlet />}
                                  >
                                    <Route index element={<WorkspaceOutboardHardwareOverviewPage />} />
                                    <Route path=":deviceId" element={<WorkspaceOutboardHardwareDevicePage />} />
                                  </Route>
                                </Route>
                                <Route path="/labs/push-surface" element={<PushSurfacePage />} />
                                <Route path="/maschine" element={<MaschinePage />} />
                                <Route path="/mcu" element={<McuPage />} />
                                <Route path="/launch-control" element={<LaunchControlPage />} />
                                <Route path="/midi-commander" element={<MidiCommanderPage />} />
                                <Route path="/chains" element={<ChainsPage />} />
                                <Route path="/legacy" element={<LegacyPage />} />
                                <Route path="/about" element={<LegacyStandalonePanelRedirect panel="about" />} />
                                <Route path="/theme" element={<LegacyStandalonePanelRedirect panel="theme" />} />
                                <Route path="/plugins" element={<LegacyArtifactsRedirect defaultCategory="lv2-plugins" />} />
                                <Route path="/library" element={<LegacyArtifactsRedirect />} />
                                <Route path="/audio-artifacts" element={<LegacyArtifactsRedirect />} />
                                <Route path="/artifacts" element={<AudioArtifactsPage />} />
                                <Route path="/artifacts/discover" element={<AudioArtifactsPage discoverMode />} />
                                <Route path="/midi" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/midi-hub-2" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/midi-hub" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/physical-surfaces/*" element={<PhysicalSurfacesShell />}>
                                  <Route index element={<PhysicalSurfacesOverviewPage />} />
                                  <Route path=":surfaceId" element={<PhysicalSurfaceUnitPage />} />
                                </Route>
                                <Route path="/outboard-hardware/*" element={<OutboardHardwareShell />}>
                                  <Route index element={<OutboardHardwareOverviewPage />} />
                                  <Route path=":deviceId" element={<OutboardHardwareDevicePage />} />
                                </Route>
                                <Route path="/midi-hub/*" element={<RouteBoundary title="MIDI Hub view crashed" actionLabel="Reload MIDI Hub"><MidiHubShell /></RouteBoundary>}>
                                  <Route index element={<Navigate to="connections" replace />} />
                                  <Route path="connections" element={<MidiHubConnectionsPage />} />
                                  <Route path="presets" element={<MidiHubPresetsPage />} />
                                  <Route path="transport" element={<MidiHubTransportPage />} />
                                  <Route path="events" element={<MidiHubEventsPage />} />
                                  <Route path="processing" element={<MidiHubProcessingPage />} />
                                  <Route path="network" element={<MidiHubNetworkPage />} />
                                  <Route path="lab" element={<MidiHubLabPage />} />
                                </Route>
                                <Route path="/grid" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/juce-grid" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/snapshot-editor" element={<RouteBoundary title="Snapshot Editor crashed" actionLabel="Reload snapshot editor"><SnapshotEditorPage /></RouteBoundary>} />
                                <Route path="/snapshots/:snapshotId/publish" element={<RouteBoundary title="Snapshot publish workspace crashed" actionLabel="Reload publish workspace"><SnapshotPublishPage /></RouteBoundary>} />
                                <Route path="/grid-3d" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/dsp" element={<RouteBoundary title="DSP view crashed" actionLabel="Reload DSP view"><DSPPage /></RouteBoundary>} />
                                <Route path="/edirol-ua1000" element={<EdirolUA1000Page />} />
                                <Route path="/motu-rme" element={<MOTURMEPage />} />
                                <Route path="/hotone-jogg" element={<HoToneJoGGPage />} />
                                <Route path="/host-machine" element={<LegacyStandalonePanelRedirect panel="host-machine" />} />
                                <Route path="/cpu-performance" element={<CPUPerformancePage />} />
                                <Route path="/engine" element={<LegacyStandalonePanelRedirect panel="audio-engine" />} />
                                <Route path="/metering" element={<RouteBoundary title="Metering view crashed" actionLabel="Reload metering"><MeteringPage /></RouteBoundary>} />
                                <Route path="/pipewire" element={<RouteBoundary title="PipeWire view crashed" actionLabel="Reload PipeWire"><PipeWirePage /></RouteBoundary>} />
                                <Route path="/welcome" element={<WelcomePage />} />
                                <Route path="/lcd" element={<LCDPage />} />
                                <Route path="/brain" element={<PerformanceBrainPage />} />
                                <Route path="/expression" element={<ExpressionPage />} />
                                <Route path="/ground-control-pro" element={<GroundControlProPage />} />
                                <Route path="/tesira/*" element={<TesiraPage />} />
                                <Route path="/mpx1/*" element={<MPX1Page />}>
                                  <Route index element={<Navigate to="panel" replace />} />
                                  <Route path="panel" element={<MPX1PanelView />} />
                                  <Route path="editor" element={<MPX1EditorView />} />
                                  <Route path="midi-map" element={<MPX1MidiMapView />} />
                                  <Route path="matrix" element={<MPX1MatrixView />} />
                                  <Route path="library" element={<MPX1LibraryView />} />
                                  <Route path="perform" element={<MPX1PerformView />} />
                                  <Route path="diag" element={<MPX1DiagView />} />
                                  <Route
                                    path="flow"
                                    element={
                                      <ErrorBoundary title="MPX1 signal path view crashed" actionLabel="Reload signal path">
                                        <MPX1FlowView />
                                      </ErrorBoundary>
                                    }
                                  />
                                </Route>
                                <Route path="/intelfx/*" element={<IntelFXPage />}>
                                  <Route index element={<Navigate to="panel" replace />} />
                                  <Route path="panel" element={<IntelFXPanelView />} />
                                  <Route path="editor" element={<IntelFXEditorView />} />
                                  <Route path="midi-map" element={<IntelFXMidiMapView />} />
                                  <Route path="library" element={<IntelFXLibraryView />} />
                                  <Route path="perform" element={<IntelFXPerformView />} />
                                  <Route path="diag" element={<IntelFXMonitorView />} />
                                  <Route
                                    path="flow"
                                    element={
                                      <ErrorBoundary title="IntelFX signal path view crashed" actionLabel="Reload signal path">
                                        <IntelFXFlowView />
                                      </ErrorBoundary>
                                    }
                                  />
                                </Route>
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                          </Suspense>
                        </AppShell>
                      }
                    />
                    </Routes>
                  </div>
                </div>
              </ErrorBoundary>
            </ToastProvider>
          </ClusterProvider>
        </BrowserRouter>
      </ViewportPolicyGate>
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  )
}
