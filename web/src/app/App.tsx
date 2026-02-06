import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppShell } from './layout/AppShell'
import { HomePage } from './pages/HomePage'
import { ChainsPage } from './pages/ChainsPage'
import { PresetsPage } from './pages/PresetsPage'
import { LegacyPage } from './pages/LegacyPage'
import { AboutPage } from './pages/AboutPage'
import { LV2PluginsPage } from './pages/LV2PluginsPage'
import { LibraryPage } from './pages/LibraryPage'
import { MIDIPage } from './pages/MIDIPage'
import { ToastProvider } from './components/Toasts'
import { GridFlowPage } from './pages/GridFlowPage'
import { DSPPage } from './pages/DSPPage'
import { EdirolUA1000Page } from './pages/EdirolUA1000Page'
import { HoToneJoGGPage } from './pages/HoToneJoGGPage'
import { MeteringPage } from './pages/MeteringPage'
import { WelcomePage } from './pages/WelcomePage'
import { LCDPage } from './pages/LCDPage'
import { LCDDashboardPage } from './pages/LCDDashboardPage'
import { NodeLCDPage } from './pages/NodeLCDPage'
import { LCDSettingsPage } from './pages/LCDSettingsPage'
import { ClusterDashboardPage } from './pages/ClusterDashboardPage'
import { MidiLearnProvider } from './hooks/useMidiLearn'

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
                <Route path="/dsp" element={<DSPPage />} />
                <Route path="/edirol-ua1000" element={<EdirolUA1000Page />} />
                <Route path="/hotone-jogg" element={<HoToneJoGGPage />} />
                <Route path="/metering" element={<MeteringPage />} />
                <Route path="/welcome" element={<WelcomePage />} />
                <Route path="/lcd" element={<LCDPage />} />
                <Route path="/lcd-dashboard" element={<LCDDashboardPage />} />
                <Route path="/lcd-nodes" element={<NodeLCDPage />} />
                <Route path="/lcd-settings" element={<LCDSettingsPage />} />
                <Route path="/cluster-dashboard" element={<ClusterDashboardPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ToastProvider>
        </MidiLearnProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
