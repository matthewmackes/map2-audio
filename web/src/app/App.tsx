import React, { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, unstable_HistoryRouter as HistoryRouter, useLocation, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandingProvider } from './branding/BrandingContext'
import { DataTableSkeleton, SkeletonPlaceholder, SkeletonText } from '@carbon/react'
import { AppShell } from './layout/AppShell'
import { appHistory } from './history'
import { Map2BrandMark } from './components/branding/map2Branding'
import { ViewportPolicyGate } from './components/ViewportPolicyGate'
import { ToastProvider, useToasts } from './components/Toasts'
import { PlatformEventProvider } from './components/PlatformEventProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { ClusterProvider } from './contexts/ClusterContext'
import { useWebSocketConnection } from '../map2/hooks/useWebSocket'
import {
  buildLegacyPlatformRedirectPath,
  buildPlatformWorkspacePath,
  buildWorkspaceHubPlatformPath,
  isPlatformWorkspaceId,
} from './platform/routes'
import { LoadingState } from './components/shared/LoadingState'
import { buildWorkspaceArtifactsDiscoverPath, buildWorkspaceArtifactsPath } from './pages/audioArtifactsRoutes'
import { buildDeviceRoute, getDeviceEntry } from './data/deviceRegistry'

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
const PlatformWorkspaceSection = lazy(() => import('./pages/workspace-hub/platforms/PlatformWorkspaceSection').then(m => ({ default: m.PlatformWorkspaceSection })))
const WorkspaceArtifactsOverviewPage = lazy(() => import('./pages/workspace-hub/artifacts/WorkspaceArtifactsOverviewPage').then(m => ({ default: m.WorkspaceArtifactsOverviewPage })))
const WorkspaceArtifactsDiscoverPage = lazy(() => import('./pages/workspace-hub/artifacts/WorkspaceArtifactsDiscoverPage').then(m => ({ default: m.WorkspaceArtifactsDiscoverPage })))
const WorkspaceHubShell = lazy(() => import('./pages/WorkspaceHubShell').then(m => ({ default: m.WorkspaceHubShell })))
const WorkspaceHubIndexRedirect = lazy(() => import('./pages/WorkspaceHubShell').then(m => ({ default: m.WorkspaceHubIndexRedirect })))
const PushSurfacePage       = lazy(() => import('./pages/PushSurfacePage').then(m => ({ default: m.PushSurfacePage })))
const MaschinePage          = lazy(() => import('./pages/MaschinePage').then(m => ({ default: m.MaschinePage })))
const McuPage               = lazy(() => import('./pages/McuPage').then(m => ({ default: m.McuPage })))
const LaunchControlPage     = lazy(() => import('./pages/LaunchControlPage').then(m => ({ default: m.LaunchControlPage })))
const MidiCommanderPage     = lazy(() => import('./pages/MidiCommanderPage').then(m => ({ default: m.MidiCommanderPage })))
const MidiHubShell          = lazy(() => import('./pages/MidiHubShell').then(m => ({ default: m.MidiHubShell })))
const MidiHubConnectionsPage = lazy(() => import('./pages/midi-hub/MidiHubConnectionsPage').then(m => ({ default: m.MidiHubConnectionsPage })))
const MidiHubPresetsPage    = lazy(() => import('./pages/midi-hub/MidiHubPresetsPage').then(m => ({ default: m.MidiHubPresetsPage })))
const MidiHubTransportPage  = lazy(() => import('./pages/midi-hub/MidiHubTransportPage').then(m => ({ default: m.MidiHubTransportPage })))
const MidiHubEventsPage     = lazy(() => import('./pages/midi-hub/MidiHubEventsPage').then(m => ({ default: m.MidiHubEventsPage })))
const MidiHubProcessingPage = lazy(() => import('./pages/midi-hub/MidiHubProcessingPage').then(m => ({ default: m.MidiHubProcessingPage })))
const MidiHubNetworkPage    = lazy(() => import('./pages/midi-hub/MidiHubNetworkPage').then(m => ({ default: m.MidiHubNetworkPage })))
const MidiHubLabPage        = lazy(() => import('./pages/midi-hub/MidiHubLabPage').then(m => ({ default: m.MidiHubLabPage })))
const SnapshotEditorPage    = lazy(() => import('./pages/SnapshotEditorPageContent').then(m => ({ default: m.SnapshotEditorPage })))
const SnapshotsBrowserPage  = lazy(() => import('./pages/SnapshotsBrowserPage').then(m => ({ default: m.SnapshotsBrowserPage })))
const StateAuthorityPage    = lazy(() => import('./pages/StateAuthorityPage').then(m => ({ default: m.StateAuthorityPage })))
const SnapshotPublishPage   = lazy(() => import('./pages/SnapshotPublishPage').then(m => ({ default: m.SnapshotPublishPage })))
const DevicesShell          = lazy(() => import('./components/Devices/DevicesShell').then(m => ({ default: m.DevicesShell })))
const DevicesStorePage      = lazy(() => import('./components/Devices/DevicesStorePage').then(m => ({ default: m.DevicesStorePage })))
const EdirolUA1000View      = lazy(() => import('./components/Devices/EdirolUA1000/EdirolUA1000View').then(m => ({ default: m.EdirolUA1000View })))
const HoToneJoGGView        = lazy(() => import('./components/Devices/HoToneJoGG/HoToneJoGGView').then(m => ({ default: m.HoToneJoGGView })))
const LCDView               = lazy(() => import('./components/Devices/LCD/LCDView').then(m => ({ default: m.LCDView })))
const TesiraView            = lazy(() => import('./components/Devices/Tesira/TesiraView').then(m => ({ default: m.TesiraView })))
const MPX1Shell             = lazy(() => import('./components/Devices/MPX1/MPX1Shell').then(m => ({ default: m.MPX1Shell })))
const MPX1PanelView         = lazy(() => import('./components/Devices/MPX1/views/MPX1PanelView').then(m => ({ default: m.MPX1PanelView })))
const MPX1EditorView        = lazy(() => import('./components/Devices/MPX1/views/MPX1EditorView').then(m => ({ default: m.MPX1EditorView })))
const MPX1MidiMapView       = lazy(() => import('./components/Devices/MPX1/views/MPX1MidiMapView').then(m => ({ default: m.MPX1MidiMapView })))
const MPX1MatrixView        = lazy(() => import('./components/Devices/MPX1/views/MPX1MatrixView').then(m => ({ default: m.MPX1MatrixView })))
const MPX1LibraryView       = lazy(() => import('./components/Devices/MPX1/views/MPX1LibraryView').then(m => ({ default: m.MPX1LibraryView })))
const MPX1DiagView          = lazy(() => import('./components/Devices/MPX1/views/MPX1DiagView').then(m => ({ default: m.MPX1DiagView })))
const MPX1PerformView       = lazy(() => import('./components/Devices/MPX1/views/MPX1PerformView').then(m => ({ default: m.MPX1PerformView })))
const MPX1FlowView          = lazy(() => import('./components/Devices/MPX1/views/MPX1FlowView').then(m => ({ default: m.MPX1FlowView })))
const IntelFXShell          = lazy(() => import('./components/Devices/IntelFX/IntelFXShell').then(m => ({ default: m.IntelFXShell })))
const IntelFXPanelView      = lazy(() => import('./components/Devices/IntelFX/views/IntelFXPanelView').then(m => ({ default: m.IntelFXPanelView })))
const IntelFXEditorView     = lazy(() => import('./components/Devices/IntelFX/views/IntelFXEditorView').then(m => ({ default: m.IntelFXEditorView })))
const IntelFXMidiMapView    = lazy(() => import('./components/Devices/IntelFX/views/IntelFXMidiMapView').then(m => ({ default: m.IntelFXMidiMapView })))
const IntelFXLibraryView    = lazy(() => import('./components/Devices/IntelFX/views/IntelFXLibraryView').then(m => ({ default: m.IntelFXLibraryView })))
const IntelFXPerformView    = lazy(() => import('./components/Devices/IntelFX/views/IntelFXPerformView').then(m => ({ default: m.IntelFXPerformView })))
const IntelFXMonitorView    = lazy(() => import('./components/Devices/IntelFX/views/IntelFXMonitorView').then(m => ({ default: m.IntelFXMonitorView })))
const IntelFXFlowView       = lazy(() => import('./components/Devices/IntelFX/views/IntelFXFlowView').then(m => ({ default: m.IntelFXFlowView })))
const MOTURMEPage           = lazy(() => import('./pages/MOTURMEPage'))
const WelcomePage           = lazy(() => import('./pages/WelcomePage').then(m => ({ default: m.WelcomePage })))
const PerformanceBrainPage  = lazy(() => import('./pages/PerformanceBrainPage').then(m => ({ default: m.PerformanceBrainPage })))
const MeteringPage          = lazy(() => import('./pages/MeteringPage').then(m => ({ default: m.MeteringPage })))
const PipeWirePage          = lazy(() => import('./pages/PipeWirePage').then(m => ({ default: m.PipeWirePage })))
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
          : pathname.startsWith('/engine') || pathname.startsWith('/pipewire')
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
  const redirectTarget = buildLegacyPlatformRedirectPath(new URLSearchParams(location.search), buildWorkspaceHubPlatformPath)

  if (redirectTarget) {
    return <Navigate to={redirectTarget} replace />
  }

  return <HomePage />
}

function LegacyPlatformRedirect() {
  const location = useLocation()
  const redirectTarget = buildLegacyPlatformRedirectPath(new URLSearchParams(location.search), buildWorkspaceHubPlatformPath)

  return <Navigate to={redirectTarget ?? buildWorkspaceHubPlatformPath('overview')} replace />
}

function LegacyArtifactsRedirect({ defaultCategory }: { defaultCategory?: string }) {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  if (defaultCategory && !searchParams.has('category')) {
    searchParams.set('category', defaultCategory)
  }
  return <Navigate to={buildWorkspaceArtifactsPath(searchParams)} replace />
}

function LegacyArtifactsDiscoverRedirect() {
  const location = useLocation()
  return <Navigate to={buildWorkspaceArtifactsDiscoverPath(location.search)} replace />
}

function LegacyStandalonePanelRedirect({ panel }: { panel: 'host-machine' | 'audio-engine' | 'theme' | 'about' }) {
  const location = useLocation()
  const search = location.search || ''
  return <Navigate to={`${buildPlatformWorkspacePath(panel)}${search}`} replace />
}

function LegacyPlatformWorkspaceRedirect() {
  const location = useLocation()
  const params = useParams<{ workspace?: string }>()
  const redirectedTarget = buildLegacyPlatformRedirectPath(
    new URLSearchParams(location.search),
    buildWorkspaceHubPlatformPath,
  )

  if (redirectedTarget) {
    return <Navigate to={redirectedTarget} replace />
  }

  const workspace = params.workspace
  const normalizedWorkspace = isPlatformWorkspaceId(workspace) ? workspace : 'overview'
  return <Navigate to={`${buildWorkspaceHubPlatformPath(normalizedWorkspace)}${location.search || ''}`} replace />
}

function LegacyPhysicalSurfacesRedirect() {
  const location = useLocation()
  const params = useParams<{ surfaceId?: string }>()
  const targetId = params.surfaceId && getDeviceEntry(params.surfaceId) ? params.surfaceId : null
  const target = targetId ? buildDeviceRoute(targetId) : '/devices'
  return <Navigate to={`${target}${location.search || ''}`} replace />
}

function LegacyOutboardHardwareRedirect() {
  const location = useLocation()
  const params = useParams<{ deviceId?: string }>()
  const targetId = params.deviceId && getDeviceEntry(params.deviceId) ? params.deviceId : null
  const target = targetId ? buildDeviceRoute(targetId) : '/devices'
  return <Navigate to={`${target}${location.search || ''}`} replace />
}

function MPX1LegacyRedirect() {
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/devices/mpx1/${params.view ?? 'panel'}`} replace />
}

function IntelFXLegacyRedirect() {
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/devices/intelfx/${params.view ?? 'panel'}`} replace />
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
        title: 'Backend unreachable',
        action: {
          label: 'Retry now',
          onClick: () => client.retryNow(),
        },
        stage: {
          kind: 'critical_alert',
          severity: 'critical',
          resource: {
            kind: 'backend',
            id: 'primary',
          },
          compactLabel: 'Backend',
          sourceLabel: 'MAP2 backend',
          replaceLiveBanner: true,
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
        title: 'Backend reconnecting',
        stage: {
          kind: 'warning_alert',
          severity: 'warning',
          resource: {
            kind: 'backend',
            id: 'primary',
          },
          compactLabel: 'Backend',
          sourceLabel: 'MAP2 backend',
          replaceLiveBanner: true,
        },
      })
      return
    }

    dismissToast(RETRYING_TOAST_ID)
  }, [status, dismissToast, pushToast])

  return null
}

export function App() {
  const routerHistory = appHistory as unknown as Parameters<typeof HistoryRouter>[0]['history']

  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
      <ViewportPolicyGate>
    <HistoryRouter
      history={routerHistory}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
    >
          <ClusterProvider>
            <ToastProvider>
              <PlatformEventProvider>
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
                                <Route path="/platforms" element={<Navigate to={buildWorkspaceHubPlatformPath('overview')} replace />} />
                                <Route path="/platforms/workspace-catalog" element={<Navigate to={buildWorkspaceHubPlatformPath('overview')} replace />} />
                                <Route path="/platforms/:workspace" element={<LegacyPlatformWorkspaceRedirect />} />
                                <Route path="/workspace/*" element={<WorkspaceHubShell />}>
                                  <Route index element={<WorkspaceHubIndexRedirect />} />
                                  <Route
                                    path="platforms/:workspace"
                                    element={<PlatformWorkspaceSection />}
                                  />
                                  <Route
                                    path="physical-surfaces"
                                    element={<Navigate to="/devices" replace />}
                                  />
                                  <Route
                                    path="physical-surfaces/:surfaceId"
                                    element={<LegacyPhysicalSurfacesRedirect />}
                                  />
                                  <Route
                                    path="artifacts"
                                    element={<WorkspaceArtifactsOverviewPage />}
                                  />
                                  <Route
                                    path="artifacts/discover"
                                    element={<WorkspaceArtifactsDiscoverPage />}
                                  />
                                  <Route
                                    path="outboard-hardware"
                                    element={<Navigate to="/devices" replace />}
                                  />
                                  <Route
                                    path="outboard-hardware/:deviceId"
                                    element={<LegacyOutboardHardwareRedirect />}
                                  />
                                </Route>
                                <Route path="/labs/push-surface" element={<PushSurfacePage />} />
                                <Route path="/maschine" element={<MaschinePage />} />
                                <Route path="/maschine/midi-map" element={<Navigate to="/maschine#hardware-layout" replace />} />
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
                                <Route path="/artifacts" element={<LegacyArtifactsRedirect />} />
                                <Route path="/artifacts/discover" element={<LegacyArtifactsDiscoverRedirect />} />
                                <Route path="/midi" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/midi-hub-2" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/midi-hub" element={<Navigate to="/midi-hub/connections" replace />} />
                                <Route path="/physical-surfaces" element={<LegacyPhysicalSurfacesRedirect />} />
                                <Route path="/physical-surfaces/:surfaceId" element={<LegacyPhysicalSurfacesRedirect />} />
                                <Route path="/outboard-hardware" element={<LegacyOutboardHardwareRedirect />} />
                                <Route path="/outboard-hardware/:deviceId" element={<LegacyOutboardHardwareRedirect />} />
                                <Route path="/dsp" element={<Navigate to={buildWorkspaceHubPlatformPath('overview')} replace />} />
                                <Route path="/cpu-performance" element={<Navigate to={buildWorkspaceHubPlatformPath('overview')} replace />} />
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
                                <Route path="/snapshots" element={<RouteBoundary title="Snapshots browser crashed" actionLabel="Reload snapshots browser"><SnapshotsBrowserPage /></RouteBoundary>} />
                                <Route path="/state-authority" element={<RouteBoundary title="State Authority crashed" actionLabel="Reload state authority"><StateAuthorityPage /></RouteBoundary>} />
                                <Route path="/snapshots/:snapshotId/publish" element={<RouteBoundary title="Snapshot publish workspace crashed" actionLabel="Reload publish workspace"><SnapshotPublishPage /></RouteBoundary>} />
                                <Route path="/grid-3d" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/devices" element={<RouteBoundary title="Devices workspace crashed" actionLabel="Reload devices"><DevicesShell /></RouteBoundary>}>
                                  <Route index element={<DevicesStorePage />} />
                                  <Route path="edirol-ua1000" element={<EdirolUA1000View />} />
                                  <Route path="edirol-ua1000/:view" element={<EdirolUA1000View />} />
                                  <Route path="hotone-jogg" element={<HoToneJoGGView />} />
                                  <Route path="hotone-jogg/:view" element={<HoToneJoGGView />} />
                                  <Route path="lcd" element={<LCDView />} />
                                  <Route path="lcd/:view" element={<LCDView />} />
                                  <Route path="tesira/*" element={<TesiraView />} />
                                  <Route path="mpx1/*" element={<MPX1Shell />}>
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
                                  <Route path="intelfx/*" element={<IntelFXShell />}>
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
                                </Route>
                                <Route path="/edirol-ua1000" element={<Navigate to="/devices/edirol-ua1000" replace />} />
                                <Route path="/hotone-jogg" element={<Navigate to="/devices/hotone-jogg" replace />} />
                                <Route path="/lcd" element={<Navigate to="/devices/lcd" replace />} />
                                <Route path="/tesira/*" element={<Navigate to="/devices/tesira" replace />} />
                                <Route path="/mpx1" element={<Navigate to="/devices/mpx1/panel" replace />} />
                                <Route path="/mpx1/:view" element={<MPX1LegacyRedirect />} />
                                <Route path="/intelfx" element={<Navigate to="/devices/intelfx/panel" replace />} />
                                <Route path="/intelfx/:view" element={<IntelFXLegacyRedirect />} />
                                <Route path="/motu-rme" element={<MOTURMEPage />} />
                                <Route path="/host-machine" element={<LegacyStandalonePanelRedirect panel="host-machine" />} />
                                <Route path="/engine" element={<LegacyStandalonePanelRedirect panel="audio-engine" />} />
                                <Route path="/metering" element={<RouteBoundary title="Metering view crashed" actionLabel="Reload metering"><MeteringPage /></RouteBoundary>} />
                                <Route path="/pipewire" element={<RouteBoundary title="PipeWire view crashed" actionLabel="Reload PipeWire"><PipeWirePage /></RouteBoundary>} />
                                <Route path="/welcome" element={<WelcomePage />} />
                                <Route path="/brain" element={<PerformanceBrainPage />} />
                                <Route path="/expression" element={<ExpressionPage />} />
                                <Route path="/ground-control-pro" element={<GroundControlProPage />} />
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
              </PlatformEventProvider>
            </ToastProvider>
          </ClusterProvider>
    </HistoryRouter>
      </ViewportPolicyGate>
      </BrandingProvider>
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  )
}
