import React, { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, unstable_HistoryRouter as HistoryRouter, useLocation, useParams } from 'react-router-dom'
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
import './RouteLoadingState.css'
import { buildWorkspaceArtifactsDiscoverPath, buildWorkspaceArtifactsPath } from './pages/audioArtifactsRoutes'
import { HOST_MACHINE_ROUTE } from './pages/hostMachineRoutes'
// T2459-G11b — small inline whitelist replacing the deprecated
// `deviceRegistry` lookups for the legacy redirect resolvers.
// Add entries here as new legacy device ids appear (rare; the
// modern path is the profile-registry-driven Hardware Store).
const KNOWN_LEGACY_DEVICE_IDS = new Set<string>([
  'mpx1',
  'intelfx',
  'edirol-ua1000',
  'hotone-jogg',
  'lcd',
  'tesira',
])

function buildDeviceRoute(deviceId: string, viewId?: string): string {
  return viewId
    ? `/devices/${deviceId}/${viewId}`
    : `/devices/${deviceId}`
}

// Lazy-load devtools so they don't bloat the production shell chunk. The
// import is also gated on NODE_ENV so the prod build tree-shakes the
// `lazy()` call entirely. Using process.env.NODE_ENV (instead of
// import.meta.env.DEV) keeps the gate compatible with both Vite (which
// statically replaces `process.env.NODE_ENV` at build time) and Jest
// (which sets NODE_ENV='test', so the gate is false in tests too).
const ReactQueryDevtools = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
  ? lazy(() => import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools })))
  : null

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
const HostMachinePage       = lazy(() => import('./pages/HostMachinePage').then(m => ({ default: m.HostMachinePage })))
const PushSurfacePage       = lazy(() => import('./pages/PushSurfacePage').then(m => ({ default: m.PushSurfacePage })))
const MaschinePage          = lazy(() => import('./pages/MaschinePage').then(m => ({ default: m.MaschinePage })))
const McuPage               = lazy(() => import('./pages/McuPage').then(m => ({ default: m.McuPage })))
const LaunchControlPage     = lazy(() => import('./pages/LaunchControlPage').then(m => ({ default: m.LaunchControlPage })))
const MidiCommanderPage     = lazy(() => import('./pages/MidiCommanderPage').then(m => ({ default: m.MidiCommanderPage })))
const MidiHubShell          = lazy(() => import('./pages/MidiHubShell').then(m => ({ default: m.MidiHubShell })))
// T2482 loop 10 / iter 92 — MIDI Services canonical mount.
// MidiServicesShell is a thin re-export of MidiHubShell (see
// pages/MidiServicesShell.tsx for the iter-92 design D1 rationale).
const MidiServicesShell     = lazy(() => import('./pages/MidiServicesShell').then(m => ({ default: m.MidiServicesShell })))
// T2482 loop 10 / iter 95 — overview region.
const MidiServicesOverviewPage = lazy(() => import('./pages/midi-services/MidiServicesOverviewPage').then(m => ({ default: m.MidiServicesOverviewPage })))
const MidiServicesDevicesPage = lazy(() => import('./pages/midi-services/MidiServicesDevicesPage').then(m => ({ default: m.MidiServicesDevicesPage })))
const MidiServicesDevicePage = lazy(() => import('./pages/midi-services/MidiServicesDevicePage').then(m => ({ default: m.MidiServicesDevicePage })))
// T2485-6 — Maschine MIDI landing (cross-links into /maschine console).
const MidiDeviceMaschineLanding = lazy(() => import('./pages/midi-services/MidiDeviceMaschineLanding').then(m => ({ default: m.MidiDeviceMaschineLanding })))
// T2485-7a — additional console-style device landings.
const MidiDeviceMcuLanding = lazy(() => import('./pages/midi-services/MidiDeviceMcuLanding').then(m => ({ default: m.MidiDeviceMcuLanding })))
const MidiDeviceLaunchControlLanding = lazy(() => import('./pages/midi-services/MidiDeviceLaunchControlLanding').then(m => ({ default: m.MidiDeviceLaunchControlLanding })))
const MidiDeviceMidiCommanderLanding = lazy(() => import('./pages/midi-services/MidiDeviceMidiCommanderLanding').then(m => ({ default: m.MidiDeviceMidiCommanderLanding })))
// T2487-3 — Expression unified-shell console (replaces the iter-8
// MidiDeviceExpressionLanding cross-link, which is now retired).
const ExpressionConsoleView = lazy(() => import('./components/Devices/Expression/ExpressionConsoleView').then(m => ({ default: m.ExpressionConsoleView })))
// T2488 — Voodoo Lab Ground Control Pro unified console (supersedes
// the iter-9 MidiDeviceGroundControlProLanding cross-link).
const GroundControlProConsoleView = lazy(() => import('./components/Devices/GroundControlPro/GroundControlProConsoleView').then(m => ({ default: m.GroundControlProConsoleView })))
// T2485-7d — Ableton Push 3 landing.
const MidiDevicePushSurfaceLanding = lazy(() => import('./pages/midi-services/MidiDevicePushSurfaceLanding').then(m => ({ default: m.MidiDevicePushSurfaceLanding })))
const MidiServicesBindingsPage = lazy(() => import('./pages/midi-services/MidiServicesBindingsPage').then(m => ({ default: m.MidiServicesBindingsPage })))
const MidiServicesRoutingPage = lazy(() => import('./pages/midi-services/MidiServicesRoutingPage').then(m => ({ default: m.MidiServicesRoutingPage })))
const MidiServicesNetworkPage = lazy(() => import('./pages/midi-services/MidiServicesNetworkPage').then(m => ({ default: m.MidiServicesNetworkPage })))
const MidiServicesPresetsPage = lazy(() => import('./pages/midi-services/MidiServicesPresetsPage').then(m => ({ default: m.MidiServicesPresetsPage })))
const MidiServicesEventsPage = lazy(() => import('./pages/midi-services/MidiServicesEventsPage').then(m => ({ default: m.MidiServicesEventsPage })))
const MidiServicesProcessingPage = lazy(() => import('./pages/midi-services/MidiServicesProcessingPage').then(m => ({ default: m.MidiServicesProcessingPage })))
const MidiServicesLabPage = lazy(() => import('./pages/midi-services/MidiServicesLabPage').then(m => ({ default: m.MidiServicesLabPage })))
const MidiServicesTransportPage = lazy(() => import('./pages/midi-services/MidiServicesTransportPage').then(m => ({ default: m.MidiServicesTransportPage })))
const MidiServicesConnectionsPage = lazy(() => import('./pages/midi-services/MidiServicesConnectionsPage').then(m => ({ default: m.MidiServicesConnectionsPage })))
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
// T2459-G3 — Hardware Store (now owns the /devices index per T2459-G11).
const HardwareStorePage     = lazy(() => import('./components/Devices/HardwareStorePage').then(m => ({ default: m.HardwareStorePage })))
// T2459-G5 — Device detail tabs (preview route until G11 cuts over).
const DeviceDetailRoute     = lazy(() => import('./components/Devices/DeviceDetail/DeviceDetailRoute').then(m => ({ default: m.DeviceDetailRoute })))
// T2459-G8 — bench-wide diagnostics aggregate.
const DiagnosticsAggregatePage = lazy(() => import('./components/Devices/DiagnosticsAggregatePage').then(m => ({ default: m.DiagnosticsAggregatePage })))
// T2459-G9 — Pack Sources admin tab (sync runner + checksum gate).
const PackSourcesAdminPage = lazy(() => import('./components/Devices/PackSourcesAdminPage').then(m => ({ default: m.PackSourcesAdminPage })))
const EdirolUA1000View      = lazy(() => import('./components/Devices/EdirolUA1000/EdirolUA1000View').then(m => ({ default: m.EdirolUA1000View })))
const HoToneJoGGView        = lazy(() => import('./components/Devices/HoToneJoGG/HoToneJoGGView').then(m => ({ default: m.HoToneJoGGView })))
// T2459-C1 — auto-rendered device panel for any pack/model under
// device-packs/<vendor>/profiles/<model>.audio.yaml.
const DevicePage            = lazy(() => import('./pages/DevicePage').then(m => ({ default: m.DevicePage })))
// T2459-C4 — Carbon node-graph mapping editor with Mixxx XML round-trip.
const DeviceMappingsPage    = lazy(() => import('./pages/DeviceMappingsPage').then(m => ({ default: m.DeviceMappingsPage })))
// Note: LCDView is no longer a route target (T2430-A split it into LCDShell + 8 sub-views).
// It remains as a shared component module exporting LCDSimulator, InputController, etc.
const LCDShell              = lazy(() => import('./components/Devices/LCD/LCDShell').then(m => ({ default: m.LCDShell })))
const LCDDisplaysView       = lazy(() => import('./components/Devices/LCD/views/LCDDisplaysView').then(m => ({ default: m.LCDDisplaysView })))
const LCDEventsView         = lazy(() => import('./components/Devices/LCD/views/LCDEventsView').then(m => ({ default: m.LCDEventsView })))
const LCDNodesView          = lazy(() => import('./components/Devices/LCD/views/LCDNodesView').then(m => ({ default: m.LCDNodesView })))
const LCDAlertsView         = lazy(() => import('./components/Devices/LCD/views/LCDAlertsView').then(m => ({ default: m.LCDAlertsView })))
const LCDHardwareView       = lazy(() => import('./components/Devices/LCD/views/LCDHardwareView').then(m => ({ default: m.LCDHardwareView })))
const LCDSettingsView       = lazy(() => import('./components/Devices/LCD/views/LCDSettingsView').then(m => ({ default: m.LCDSettingsView })))
const LCDPresetsView        = lazy(() => import('./components/Devices/LCD/views/LCDPresetsView').then(m => ({ default: m.LCDPresetsView })))
const LCDSnapshotsView      = lazy(() => import('./components/Devices/LCD/views/LCDSnapshotsView').then(m => ({ default: m.LCDSnapshotsView })))
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
// T2487-4 — ExpressionPage shim is no longer route-rendered; /expression
// redirects to the unified /midi/devices/expression/console mount. The
// shim file still exists at pages/ExpressionPage.tsx and re-exports
// ExpressionView for the ExpressionOverlay consumer.
const MidiAssignmentsPage   = lazy(() => import('./pages/MidiAssignmentsPage').then(m => ({ default: m.MidiAssignmentsPage })))
// T2488 — GroundControlProPage is no longer route-rendered directly;
// /ground-control-pro redirects to the unified
// /midi/devices/voodoo-lab-ground-control-pro/console mount, which
// composes DeviceLandingHeader + GroundControlProPage via
// GroundControlProConsoleView.

// T2474 B11: Inline `style={{...}}` magic-number pixel values
// (24, 16, 180, 220, 280, 320, 540, 120, 240) extracted to
// .map2-route-loader CSS classes in RouteLoadingState.css. Carbon
// --cds-spacing-* tokens drive padding/gap; named skeleton-height
// tokens drive each skeleton block size.
function RouteLoadingState({ variant }: { variant: 'default' | 'snapshot' | 'midi-hub' | 'metrics' | 'audio-engine' }) {
  if (variant === 'snapshot') {
    return (
      <div className="map2-route-loader">
        <SkeletonText heading width="26%" />
        <SkeletonText paragraph lineCount={2} width="68%" />
        <div className="map2-route-loader__grid map2-route-loader__grid--snapshot-tiles">
          <SkeletonPlaceholder className="map2-route-loader__skel--tile" />
          <SkeletonPlaceholder className="map2-route-loader__skel--tile" />
          <SkeletonPlaceholder className="map2-route-loader__skel--tile" />
        </div>
        <SkeletonPlaceholder className="map2-route-loader__skel--canvas" />
      </div>
    )
  }

  if (variant === 'midi-hub') {
    return (
      <div className="map2-route-loader">
        <SkeletonText heading width="22%" />
        <div className="map2-route-loader__grid map2-route-loader__grid--midi-hub">
          <SkeletonPlaceholder className="map2-route-loader__skel--rail" />
          <div className="map2-route-loader__grid">
            <SkeletonText paragraph lineCount={2} width="58%" />
            <DataTableSkeleton rowCount={6} columnCount={5} zebra={false} />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'metrics' || variant === 'audio-engine') {
    return (
      <div className="map2-route-loader">
        <SkeletonText heading width="24%" />
        <div className="map2-route-loader__grid map2-route-loader__grid--metrics">
          <SkeletonPlaceholder className="map2-route-loader__skel--card" />
          <SkeletonPlaceholder className="map2-route-loader__skel--card" />
          <SkeletonPlaceholder className="map2-route-loader__skel--card" />
          <SkeletonPlaceholder className="map2-route-loader__skel--card" />
        </div>
        <div className="map2-route-loader__grid">
          <SkeletonPlaceholder className="map2-route-loader__skel--row" />
          <SkeletonPlaceholder className="map2-route-loader__skel--row" />
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
  const targetId = params.surfaceId && KNOWN_LEGACY_DEVICE_IDS.has(params.surfaceId) ? params.surfaceId : null
  const target = targetId ? buildDeviceRoute(targetId) : '/devices'
  return <Navigate to={`${target}${location.search || ''}`} replace />
}

function LegacyOutboardHardwareRedirect() {
  const location = useLocation()
  const params = useParams<{ deviceId?: string }>()
  const targetId = params.deviceId && KNOWN_LEGACY_DEVICE_IDS.has(params.deviceId) ? params.deviceId : null
  const target = targetId ? buildDeviceRoute(targetId) : '/devices'
  return <Navigate to={`${target}${location.search || ''}`} replace />
}

function MPX1LegacyRedirect() {
  // T2485-4 — /mpx1/:view → /midi/devices/lexicon-mpx1/:view (Q1=A hard redirect).
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/midi/devices/lexicon-mpx1/${params.view ?? 'panel'}`} replace />
}

function DevicesMpx1ViewRedirect() {
  // T2485-4 — /devices/mpx1/:view → /midi/devices/lexicon-mpx1/:view (Q1=A hard redirect).
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/midi/devices/lexicon-mpx1/${params.view ?? 'panel'}`} replace />
}

function IntelFXLegacyRedirect() {
  // T2485-5 — /intelfx/:view → /midi/devices/rocktron-intelfx/:view (Q1=A hard redirect).
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/midi/devices/rocktron-intelfx/${params.view ?? 'panel'}`} replace />
}

function DevicesIntelFXViewRedirect() {
  // T2485-5 — /devices/intelfx/:view → /midi/devices/rocktron-intelfx/:view.
  const params = useParams<{ view?: string }>()
  return <Navigate to={`/midi/devices/rocktron-intelfx/${params.view ?? 'panel'}`} replace />
}

// Default queries to "fetch once, cache for the session." Live data flows
// through WebSocket events (see PlatformEventProvider / useWebSocketConnection)
// which call queryClient.setQueryData() to push fresh state into the cache,
// so polling defaults are wasteful. Queries that genuinely need polling
// (cluster peers, CPU/VU meters) opt in explicitly via refetchInterval.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
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
                                {/* T2482 loop 10 / iter 93 — redirect direction flip.
                                    Pre-iter-93: bare /midi redirected to /midi-hub/connections.
                                    Post-iter-93: bare /midi-hub + /midi-hub-2 redirect to
                                    /midi/connections (the new canonical root). The bare /midi
                                    redirect to its child landing is now /midi → /midi/connections.
                                    Deep /midi-hub/connections etc. still work via the mount at
                                    line 510 (kept for operator continuity; iter 100 roll-up
                                    documents the deprecation timeline). */}
                                <Route path="/midi" element={<Navigate to="/midi/connections" replace />} />
                                <Route path="/midi-hub-2" element={<Navigate to="/midi/connections" replace />} />
                                <Route path="/midi-hub" element={<Navigate to="/midi/connections" replace />} />
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
                                {/* T2485-4 — Unified MIDI device shell mount.
                                    /midi/devices/lexicon-mpx1/* is the new canonical
                                    location for the MPX1 GUI; legacy /devices/mpx1/*
                                    hard-redirects here (Q1=A locked decision in
                                    PROJECT_WORKLIST.md T2485 entry). Declared BEFORE
                                    /midi/* so React Router matches the more-specific
                                    prefix first. */}
                                <Route path="/midi/devices/lexicon-mpx1/*" element={
                                  <RouteBoundary title="MPX1 view crashed" actionLabel="Reload MPX1">
                                    <MPX1Shell routePrefix="/midi/devices/lexicon-mpx1/" />
                                  </RouteBoundary>
                                }>
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
                                {/* T2485-5 — IntelFX unified mount. Same pattern as MPX1. */}
                                <Route path="/midi/devices/rocktron-intelfx/*" element={
                                  <RouteBoundary title="IntelFX view crashed" actionLabel="Reload IntelFX">
                                    <IntelFXShell routePrefix="/midi/devices/rocktron-intelfx/" />
                                  </RouteBoundary>
                                }>
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
                                {/* T2487-3 — Expression unified mount.
                                    Path A: ExpressionView is a 3-column integrated
                                    workflow (Assignment List ↔ Form ↔ Live Monitor),
                                    not a multi-tab device. The single `console`
                                    child renders DeviceLandingHeader + the
                                    integrated body. Legacy /expression hard-
                                    redirects here. */}
                                <Route path="/midi/devices/expression/*" element={
                                  <RouteBoundary title="Expression view crashed" actionLabel="Reload Expression">
                                    <Outlet />
                                  </RouteBoundary>
                                }>
                                  <Route index element={<Navigate to="console" replace />} />
                                  <Route path="console" element={<ExpressionConsoleView />} />
                                </Route>
                                {/* T2488 — Voodoo Lab Ground Control Pro unified mount.
                                    Path A: the page already has 5 internal Carbon Tabs
                                    (Overview / Configuration / Presets / Validation &
                                    Transfer / Forensics) sharing extensive state; we
                                    keep them as in-page tabs and migrate the whole
                                    page to the unified shell as a single console
                                    view. Legacy /ground-control-pro hard-redirects
                                    here. */}
                                <Route path="/midi/devices/voodoo-lab-ground-control-pro/*" element={
                                  <RouteBoundary title="Ground Control Pro view crashed" actionLabel="Reload Ground Control Pro">
                                    <Outlet />
                                  </RouteBoundary>
                                }>
                                  <Route index element={<Navigate to="console" replace />} />
                                  <Route path="console" element={<GroundControlProConsoleView />} />
                                </Route>
                                {/* T2482 loop 10 / iter 92 — MIDI Services canonical mount.
                                    Mirrors the /midi-hub/* mount above using the
                                    MidiServicesShell wrapper (which re-exports MidiHubShell).
                                    The route order matters: /midi/assignments at line ~607
                                    predates Phase 3 and continues to win because React Router
                                    matches in declaration order. Iter 93 adds the
                                    /midi-hub/* → /midi/* redirect map; iter 94 renames
                                    operator-visible labels. */}
                                <Route path="/midi/*" element={<RouteBoundary title="MIDI Services view crashed" actionLabel="Reload MIDI Services"><MidiServicesShell /></RouteBoundary>}>
                                  <Route index element={<Navigate to="connections" replace />} />
                                  {/* Connections flipped to MidiServicesConnectionsPage
                                      in iter 154 (T2483-2). Transport flipped to
                                      MidiServicesTransportPage in iter 132 (P3.6). */}
                                  <Route path="connections" element={<MidiServicesConnectionsPage />} />
                                  <Route path="presets" element={<MidiServicesPresetsPage />} />
                                  <Route path="transport" element={<MidiServicesTransportPage />} />
                                  <Route path="events" element={<MidiServicesEventsPage />} />
                                  <Route path="processing" element={<MidiServicesProcessingPage />} />
                                  <Route path="network" element={<MidiServicesNetworkPage />} />
                                  <Route path="lab" element={<MidiServicesLabPage />} />
                                  {/* T2482 loop 10 / iter 95 — Overview region scaffold.
                                      Iter 96 fills the Tile cards with live counts; once
                                      meaningful, iter 100 may flip the index redirect at
                                      `<Route index>` above to point here. */}
                                  <Route path="overview" element={<MidiServicesOverviewPage />} />
                                  {/* T2482 loop 10 / iter 98 — Devices region.
                                      INDEX surface (per the iter-97 audit): lists
                                      device-pack profiles + cross-links to per-device
                                      editors. NOT an authoring surface. */}
                                  <Route path="devices" element={<MidiServicesDevicesPage />} />
                                  {/* T2485-6 / T2485-7a — Console-backed MIDI device
                                      landings. Each profile renders a small landing
                                      page with title + 3-line purpose + a cross-link
                                      Button to its existing operator console. /maschine,
                                      /mcu, /launch-control, /midi-commander remain the
                                      primary workflow surfaces. Declared BEFORE the
                                      parametric :profileKey so React Router matches
                                      these specific paths first. */}
                                  <Route path="devices/native-instruments-maschine-mk1" element={<MidiDeviceMaschineLanding />} />
                                  <Route path="devices/mackie-mcu-pro" element={<MidiDeviceMcuLanding />} />
                                  <Route path="devices/novation-launch-control-xl" element={<MidiDeviceLaunchControlLanding />} />
                                  <Route path="devices/meloaudio-midi-commander" element={<MidiDeviceMidiCommanderLanding />} />
                                  {/* T2487-3 — devices/expression no longer renders the
                                      iter-8 cross-link landing; the unified shell mount
                                      at /midi/devices/expression/* (declared above the
                                      /midi/* catch-all) takes the bare path via its
                                      index→Navigate redirect to /console. */}
                                  {/* T2488 — devices/voodoo-lab-ground-control-pro
                                      no longer renders the iter-9 cross-link landing;
                                      the unified shell mount above takes the bare
                                      path via its index→Navigate redirect to /console. */}
                                  <Route path="devices/ableton-push-3" element={<MidiDevicePushSurfaceLanding />} />
                                  {/* T2482 loop 10 / iter 99 — Device detail stub.
                                      Read-only audit/inspection of one device-pack
                                      profile. Mutation lands in iter 100+. */}
                                  <Route path="devices/:profileKey" element={<MidiServicesDevicePage />} />
                                  {/* T2482 loop 11 / iter 103 — Bindings region.
                                      Filter-first list page (the backend rejects
                                      unfiltered queries). Iter 104+ adds toggle +
                                      OverflowMenu + edit/create modals. */}
                                  <Route path="bindings" element={<MidiServicesBindingsPage />} />
                                  {/* T2482 loop 11 / iter 107 — Routing region scaffold.
                                      Placeholder so /midi/routing mounts cleanly + the
                                      Overview Tile deep-link has a destination.
                                      Matrix UI ships loop 12+. */}
                                  <Route path="routing" element={<MidiServicesRoutingPage />} />
                                </Route>
                                <Route path={HOST_MACHINE_ROUTE} element={<RouteBoundary title="Host Machine view crashed" actionLabel="Reload host machine"><HostMachinePage /></RouteBoundary>} />
                                <Route path="/grid" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/juce-grid" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/snapshot-editor" element={<RouteBoundary title="Snapshot Editor crashed" actionLabel="Reload snapshot editor"><SnapshotEditorPage /></RouteBoundary>} />
                                <Route path="/snapshots" element={<RouteBoundary title="Snapshots browser crashed" actionLabel="Reload snapshots browser"><SnapshotsBrowserPage /></RouteBoundary>} />
                                <Route path="/state-authority" element={<RouteBoundary title="State Authority crashed" actionLabel="Reload state authority"><StateAuthorityPage /></RouteBoundary>} />
                                <Route path="/snapshots/:snapshotId/publish" element={<RouteBoundary title="Snapshot publish workspace crashed" actionLabel="Reload publish workspace"><SnapshotPublishPage /></RouteBoundary>} />
                                <Route path="/grid-3d" element={<Navigate to="/snapshot-editor" replace />} />
                                <Route path="/devices" element={<RouteBoundary title="Devices workspace crashed" actionLabel="Reload devices"><DevicesShell /></RouteBoundary>}>
                                  {/* T2459-G11 — HardwareStorePage now owns the index. */}
                                  <Route index element={<RouteBoundary title="Hardware Store crashed" actionLabel="Reload"><HardwareStorePage /></RouteBoundary>} />
                                  {/* Backward-compat redirects from the preview routes. */}
                                  <Route path="store-v2" element={<Navigate to="/devices" replace />} />
                                  <Route path="diagnostics" element={<RouteBoundary title="Diagnostics aggregate crashed" actionLabel="Reload"><DiagnosticsAggregatePage /></RouteBoundary>} />
                                  <Route path="diagnostics-v2" element={<Navigate to="/devices/diagnostics" replace />} />
                                  <Route path="pack-sources" element={<RouteBoundary title="Pack Sources crashed" actionLabel="Reload"><PackSourcesAdminPage /></RouteBoundary>} />
                                  <Route path="pack-sources-v2" element={<Navigate to="/devices/pack-sources" replace />} />
                                  <Route path="edirol-ua1000" element={<EdirolUA1000View />} />
                                  <Route path="edirol-ua1000/:view" element={<EdirolUA1000View />} />
                                  <Route path="hotone-jogg" element={<HoToneJoGGView />} />
                                  <Route path="hotone-jogg/:view" element={<HoToneJoGGView />} />
                                  {/* T2459-C1 — auto-rendered profile-driven device pages. */}
                                  <Route path="profile/:packId/:model" element={<RouteBoundary title="Device profile crashed" actionLabel="Reload"><DevicePage /></RouteBoundary>} />
                                  {/* T2459-G5 — Hardware Store device detail tabs (preview). */}
                                  <Route path="profile/:packId/:model/v2" element={<RouteBoundary title="Device detail v2 crashed" actionLabel="Reload"><DeviceDetailRoute /></RouteBoundary>} />
                                  {/* T2459-C4 — node-graph mapping editor. */}
                                  <Route path="profile/:packId/:model/mappings" element={<RouteBoundary title="Mapping editor crashed" actionLabel="Reload"><DeviceMappingsPage /></RouteBoundary>} />
                                  <Route path="lcd/*" element={<LCDShell />}>
                                    <Route index element={<Navigate to="displays" replace />} />
                                    <Route path="displays" element={<LCDDisplaysView />} />
                                    <Route path="events" element={<LCDEventsView />} />
                                    <Route path="nodes" element={<LCDNodesView />} />
                                    <Route path="alerts" element={<LCDAlertsView />} />
                                    <Route path="hardware" element={<LCDHardwareView />} />
                                    <Route path="settings" element={<LCDSettingsView />} />
                                    <Route path="presets" element={<LCDPresetsView />} />
                                    <Route path="snapshots" element={<LCDSnapshotsView />} />
                                  </Route>
                                  <Route path="tesira/*" element={<TesiraView />} />
                                  {/* T2485-4 — legacy /devices/mpx1/* hard-redirects to
                                      the unified /midi/devices/lexicon-mpx1/* mount.
                                      The actual shell + view tree now lives under that
                                      path (declared above the /midi/* mount). */}
                                  <Route path="mpx1" element={<Navigate to="/midi/devices/lexicon-mpx1/panel" replace />} />
                                  <Route path="mpx1/:view" element={<DevicesMpx1ViewRedirect />} />
                                  {/* T2485-5 — legacy /devices/intelfx/* hard-redirects to
                                      the unified /midi/devices/rocktron-intelfx/* mount. */}
                                  <Route path="intelfx" element={<Navigate to="/midi/devices/rocktron-intelfx/panel" replace />} />
                                  <Route path="intelfx/:view" element={<DevicesIntelFXViewRedirect />} />
                                </Route>
                                <Route path="/edirol-ua1000" element={<Navigate to="/devices/edirol-ua1000" replace />} />
                                <Route path="/hotone-jogg" element={<Navigate to="/devices/hotone-jogg" replace />} />
                                <Route path="/lcd" element={<Navigate to="/devices/lcd" replace />} />
                                <Route path="/tesira/*" element={<Navigate to="/devices/tesira" replace />} />
                                {/* T2485-4 — /mpx1* legacy URLs all redirect to the
                                    unified canonical /midi/devices/lexicon-mpx1/* (Q1=A). */}
                                <Route path="/mpx1" element={<Navigate to="/midi/devices/lexicon-mpx1/panel" replace />} />
                                <Route path="/mpx1/:view" element={<MPX1LegacyRedirect />} />
                                {/* T2485-5 — /intelfx* legacy URLs redirect to the unified canonical (Q1=A). */}
                                <Route path="/intelfx" element={<Navigate to="/midi/devices/rocktron-intelfx/panel" replace />} />
                                <Route path="/intelfx/:view" element={<IntelFXLegacyRedirect />} />
                                <Route path="/motu-rme" element={<MOTURMEPage />} />
                                <Route path="/host-machine" element={<LegacyStandalonePanelRedirect panel="host-machine" />} />
                                <Route path="/engine" element={<LegacyStandalonePanelRedirect panel="audio-engine" />} />
                                <Route path="/metering" element={<RouteBoundary title="Metering view crashed" actionLabel="Reload metering"><MeteringPage /></RouteBoundary>} />
                                <Route path="/pipewire" element={<RouteBoundary title="PipeWire view crashed" actionLabel="Reload PipeWire"><PipeWirePage /></RouteBoundary>} />
                                <Route path="/welcome" element={<WelcomePage />} />
                                <Route path="/brain" element={<PerformanceBrainPage />} />
                                {/* T2487-4 — /expression hard-redirects to the unified
                                    /midi/devices/expression/console mount (Q1=A locked
                                    decision). ExpressionPage shim still exports
                                    ExpressionView for the ExpressionOverlay consumer. */}
                                <Route path="/expression" element={<Navigate to="/midi/devices/expression/console" replace />} />
                                <Route path="/midi/assignments" element={<RouteBoundary title="MIDI Assignments crashed" actionLabel="Reload MIDI Assignments"><MidiAssignmentsPage /></RouteBoundary>} />
                                <Route path="/midi-assignments" element={<Navigate to="/midi/assignments" replace />} />
                                <Route path="/midi-hub/assignments" element={<Navigate to="/midi/assignments" replace />} />
                                {/* T2488 — /ground-control-pro hard-redirects to the
                                    unified /midi/devices/voodoo-lab-ground-control-pro/console
                                    mount (Q1=A locked decision). */}
                                <Route path="/ground-control-pro" element={<Navigate to="/midi/devices/voodoo-lab-ground-control-pro/console" replace />} />
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
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  )
}
