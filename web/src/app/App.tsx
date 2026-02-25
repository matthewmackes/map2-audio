import React, { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './layout/AppShell'
import { ToastProvider } from './components/Toasts'
import { MidiLearnProvider } from './hooks/useMidiLearn'

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
const PresetsPage           = lazy(() => import('./pages/PresetsPage').then(m => ({ default: m.PresetsPage })))
const LegacyPage            = lazy(() => import('./pages/LegacyPage').then(m => ({ default: m.LegacyPage })))
const AboutPage             = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })))
const LV2PluginsPage        = lazy(() => import('./pages/LV2PluginsPage').then(m => ({ default: m.LV2PluginsPage })))
const LibraryPage           = lazy(() => import('./pages/LibraryPage').then(m => ({ default: m.LibraryPage })))
const MIDIPage              = lazy(() => import('./pages/MIDIPage').then(m => ({ default: m.MIDIPage })))
const GridFlowPage          = lazy(() => import('./pages/GridFlowPage').then(m => ({ default: m.GridFlowPage })))
const GridFlowAdvancedPage  = lazy(() => import('./pages/GridFlowAdvancedPage'))
const DSPPage               = lazy(() => import('./pages/DSPPage').then(m => ({ default: m.DSPPage })))
const EdirolUA1000Page      = lazy(() => import('./pages/EdirolUA1000Page').then(m => ({ default: m.EdirolUA1000Page })))
const HoToneJoGGPage        = lazy(() => import('./pages/HoToneJoGGPage').then(m => ({ default: m.HoToneJoGGPage })))
const HostMachinePage       = lazy(() => import('./pages/HostMachinePage').then(m => ({ default: m.HostMachinePage })))
const AudioEnginePage       = lazy(() => import('./pages/AudioEnginePage').then(m => ({ default: m.AudioEnginePage })))
const MOTURMEPage           = lazy(() => import('./pages/MOTURMEPage'))
const CPUPerformancePage    = lazy(() => import('./pages/CPUPerformancePage'))
const WelcomePage           = lazy(() => import('./pages/WelcomePage').then(m => ({ default: m.WelcomePage })))
const LCDPage               = lazy(() => import('./pages/LCDPage').then(m => ({ default: m.LCDPage })))
const ClusterDashboardPage  = lazy(() => import('./pages/ClusterDashboardPage').then(m => ({ default: m.ClusterDashboardPage })))
const DrumsPage             = lazy(() => import('./pages/DrumsPage').then(m => ({ default: m.DrumsPage })))
const MultiSystemDashboard  = lazy(() => import('./pages/MultiSystemDashboardPage'))
const MeteringPage          = lazy(() => import('./pages/MeteringPage').then(m => ({ default: m.MeteringPage })).catch(() => ({ default: () => <Navigate to="/engine" replace /> })))
const PipeWirePage          = lazy(() => import('./pages/PipeWirePage').then(m => ({ default: m.PipeWirePage })).catch(() => ({ default: () => <Navigate to="/engine" replace /> })))
const AvbRoutingPage        = lazy(() => import('./pages/AvbRoutingPage').then(m => ({ default: m.AvbRoutingPage })))
const TesiraPage            = lazy(() => import('./pages/TesiraPage').then(m => ({ default: m.TesiraPage })))
const MPX1Page              = lazy(() => import('./pages/MPX1Page').then(m => ({ default: m.MPX1Page })))
const MPX1PanelView         = lazy(() => import('./pages/MPX1PanelView').then(m => ({ default: m.MPX1PanelView })))
const MPX1EditorView        = lazy(() => import('./pages/MPX1EditorView').then(m => ({ default: m.MPX1EditorView })))
const MPX1MidiMapView       = lazy(() => import('./pages/MPX1MidiMapView').then(m => ({ default: m.MPX1MidiMapView })))
const MPX1MatrixView        = lazy(() => import('./pages/MPX1MatrixView').then(m => ({ default: m.MPX1MatrixView })))
const MPX1LibraryView       = lazy(() => import('./pages/MPX1LibraryView').then(m => ({ default: m.MPX1LibraryView })))
const MPX1DiagView          = lazy(() => import('./pages/MPX1DiagView').then(m => ({ default: m.MPX1DiagView })))

/** Lightweight loading fallback — pure CSS, no MUI dependency */
function PageLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '8px' }}>
      <div style={{
        width: 36, height: 36, border: '3.5px solid rgba(150,150,150,0.25)',
        borderTopColor: '#90caf9', borderRadius: '50%',
        animation: 'map2spin .8s linear infinite',
      }} />
      <style>{`@keyframes map2spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 14, color: '#999' }}>Loading…</span>
    </div>
  )
}

function MPX1SubviewPlaceholder({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 360,
        border: '1px dashed rgba(59, 130, 246, 0.35)',
        borderRadius: 10,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.35), rgba(2,6,23,0.55))',
      }}
    >
      <div style={{ textAlign: 'center', padding: 16 }}>
        <div
          style={{
            color: '#dbeafe',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.03em',
          }}
        >
          {title}
        </div>
        <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 12 }}>{detail}</div>
      </div>
    </div>
  )
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MidiLearnProvider>
          <ToastProvider>
            <AppShell>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/chains" element={<ChainsPage />} />
                  <Route path="/presets" element={<PresetsPage />} />
                  <Route path="/legacy" element={<LegacyPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/plugins" element={<LV2PluginsPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/midi" element={<MIDIPage />} />
                  <Route path="/grid" element={<GridFlowPage />} />
                  <Route path="/grid-3d" element={<GridFlowAdvancedPage />} />
                  <Route path="/dsp" element={<DSPPage />} />
                  <Route path="/edirol-ua1000" element={<EdirolUA1000Page />} />
                  <Route path="/motu-rme" element={<MOTURMEPage />} />
                  <Route path="/hotone-jogg" element={<HoToneJoGGPage />} />
                  <Route path="/host-machine" element={<HostMachinePage />} />
                  <Route path="/cpu-performance" element={<CPUPerformancePage />} />
                  <Route path="/engine" element={<AudioEnginePage />} />
                  <Route path="/metering" element={<MeteringPage />} />
                  <Route path="/pipewire" element={<PipeWirePage />} />
                  <Route path="/welcome" element={<WelcomePage />} />
                  <Route path="/lcd" element={<LCDPage />} />
                  <Route path="/cluster-dashboard" element={<ClusterDashboardPage />} />
                  <Route path="/drums" element={<DrumsPage />} />
                  <Route path="/multi-system" element={<MultiSystemDashboard />} />
                  <Route path="/avb-routing" element={<AvbRoutingPage />} />
                  <Route path="/tesira" element={<TesiraPage />} />
                  <Route path="/mpx1/*" element={<MPX1Page />}>
                    <Route index element={<Navigate to="panel" replace />} />
                    <Route path="panel" element={<MPX1PanelView />} />
                    <Route path="editor" element={<MPX1EditorView />} />
                    <Route path="midi-map" element={<MPX1MidiMapView />} />
                    <Route path="matrix" element={<MPX1MatrixView />} />
                    <Route path="library" element={<MPX1LibraryView />} />
                    <Route path="diag" element={<MPX1DiagView />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </ToastProvider>
        </MidiLearnProvider>
      </BrowserRouter>
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  )
}
