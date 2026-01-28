import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppShell } from './layout/AppShell'
import { HomePage } from './pages/HomePage'
import { ChainsPage } from './pages/ChainsPage'
import { ChainFlowPage } from './pages/ChainFlowPage'
import { PresetsPage } from './pages/PresetsPage'
import { LegacyPage } from './pages/LegacyPage'
import { AboutPage } from './pages/AboutPage'
import { LV2PluginsPage } from './pages/LV2PluginsPage'
import { VST3PluginsPage } from './pages/VST3PluginsPage'
import { LibraryPage } from './pages/LibraryPage'
import { ToastProvider } from './components/Toasts'
import { NativePluginsPage } from './pages/NativePluginsPage'

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
        <ToastProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/chains" element={<ChainsPage />} />
              <Route path="/chains/flow" element={<ChainFlowPage />} />
              <Route path="/presets" element={<PresetsPage />} />
              <Route path="/legacy" element={<LegacyPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/plugins" element={<LV2PluginsPage />} />
              <Route path="/plugins/vst3" element={<VST3PluginsPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/native-plugins" element={<NativePluginsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </ToastProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
