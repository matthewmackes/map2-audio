import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUseCluster = jest.fn()
const mockUseDownloadProgress = jest.fn()
const mockGetDisplayPaths = jest.fn()

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useDownloadProgress', () => ({
  useDownloadProgress: () => mockUseDownloadProgress(),
}))

jest.mock('../../map2/api', () => ({
  foldersApi: {
    getDisplayPaths: (...args: unknown[]) => mockGetDisplayPaths(...args),
  },
}))

jest.mock('../components/library/InstalledBrowser', () => ({
  InstalledBrowser: ({ nodeId }: { nodeId?: string | null }) => <div data-testid="installed-browser">{nodeId ?? 'none'}</div>,
}))

jest.mock('../components/library/DownloadManager', () => ({
  DownloadManager: () => <div data-testid="download-manager">Download manager</div>,
}))

jest.mock('../components/library/LibrarySources', () => ({
  LibrarySources: () => <div data-testid="library-sources">Library sources</div>,
}))

jest.mock('../components/upload', () => ({
  UploadButton: ({ label }: { label?: string }) => <button type="button">{label || 'Upload'}</button>,
}))

import { LibraryPage } from './LibraryPage'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryPage />
    </QueryClientProvider>,
  )
}

describe('LibraryPage Carbon overview', () => {
  beforeEach(() => {
    mockUseCluster.mockReset()
    mockUseDownloadProgress.mockReset()
    mockGetDisplayPaths.mockReset()

    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-a',
      localNodeId: 'local',
      isClusterMode: true,
      nodes: [
        { nodeId: 'local', hostname: 'local', isLocal: true },
        { nodeId: 'node-a', hostname: 'remote-a', isLocal: false },
      ],
    })

    mockUseDownloadProgress.mockReturnValue({
      status: null,
      isDownloading: false,
    })

    mockGetDisplayPaths.mockResolvedValue({
      nam_models: '/srv/models',
      nam_models_display: '~/models',
      ir_cabinets: '/srv/irs/cabinets',
      ir_cabinets_display: '~/irs/cabinets',
      ir_reverbs: '/srv/irs/reverbs',
      ir_reverbs_display: '~/irs/reverbs',
      ir_user_uploads: '/home/mm/uploads',
    })

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders Carbon overview table and cluster scope content', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByText('Cluster library scope')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload assets' })).toBeInTheDocument()

    expect(screen.getByText('Asset type')).toBeInTheDocument()
    expect(screen.getByText('Used by')).toBeInTheDocument()
    expect(screen.getByText('Cabinet IRs')).toBeInTheDocument()
    expect(screen.getByText('NAM models')).toBeInTheDocument()
    expect(screen.getByText('SoundFonts')).toBeInTheDocument()

    expect(await screen.findByTestId('installed-browser')).toHaveTextContent('node-a')
    expect(screen.getByTestId('library-sources')).toBeInTheDocument()
  })

  it('expands file locations, refreshes paths, and copies a selected path', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'File locations' }))

    expect(await screen.findByText('NAM models')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh file locations' }))

    await waitFor(() => {
      expect(mockGetDisplayPaths.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy path for NAM models' }))

    await waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('/srv/models')
    })

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
