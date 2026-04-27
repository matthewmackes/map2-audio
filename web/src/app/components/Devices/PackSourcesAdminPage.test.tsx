import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

const mockListPackSources = jest.fn()
const mockGetMixxxChecksumStatus = jest.fn()

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  listPackSources: (...args: unknown[]) => mockListPackSources(...args),
  getMixxxChecksumStatus: (...args: unknown[]) => mockGetMixxxChecksumStatus(...args),
  syncMixxxStreamUrl: () => '/api/devices/sources/sync-mixxx',
}))

import { PackSourcesAdminPage } from './PackSourcesAdminPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PackSourcesAdminPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  mockListPackSources.mockReset()
  mockGetMixxxChecksumStatus.mockReset()
})

test('PackSourcesAdminPage: renders pack inventory + clean checksum state', async () => {
  mockListPackSources.mockResolvedValue({
    sources: [
      { pack_id: 'edirol-ua', vendor: 'EDIROL / Roland', source: 'shipped',
        path: '/repo/device-packs/edirol-ua', is_degraded: false,
        degraded_files: [], model_count: 6, profile_count: 12 },
      { pack_id: '_mixx-imports', vendor: 'Mixxx', source: 'imported',
        path: '/repo/device-packs/_mixx-imports', is_degraded: false,
        degraded_files: [], model_count: 0, profile_count: 0 },
    ],
    count: 2,
  })
  mockGetMixxxChecksumStatus.mockResolvedValue({
    present: true, files_checked: 397, drift: [],
    checksums_path: 'device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt',
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Pack Sources', level: 1 })).toBeInTheDocument()
  })
  // Wait for the inventory to land before asserting on row content.
  await waitFor(() => {
    const codes = Array.from(document.querySelectorAll('code')).map((c) => c.textContent)
    expect(codes).toContain('edirol-ua')
  })
  const codes = Array.from(document.querySelectorAll('code')).map((c) => c.textContent)
  expect(codes).toContain('_mixx-imports')
  expect(screen.getByText(/397 files match IMPORT_CHECKSUMS/)).toBeInTheDocument()
})

test('PackSourcesAdminPage: drift renders the warning notification + table', async () => {
  mockListPackSources.mockResolvedValue({ sources: [], count: 0 })
  mockGetMixxxChecksumStatus.mockResolvedValue({
    present: true, files_checked: 100,
    drift: [
      { path: 'device-packs/_mixx-imports/foo.js', kind: 'modified',
        expected_sha256: 'aa', actual_sha256: 'bb' },
    ],
    checksums_path: 'device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt',
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('Imported corpus drift detected')).toBeInTheDocument()
  })
  expect(screen.getByText('device-packs/_mixx-imports/foo.js')).toBeInTheDocument()
})

test('PackSourcesAdminPage: corpus-not-present renders the info banner', async () => {
  mockListPackSources.mockResolvedValue({ sources: [], count: 0 })
  mockGetMixxxChecksumStatus.mockResolvedValue({ present: false, files_checked: 0, drift: [] })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('No imported corpus yet')).toBeInTheDocument()
  })
})

test('PackSourcesAdminPage: Run sync button is disabled when clone path empty', async () => {
  mockListPackSources.mockResolvedValue({ sources: [], count: 0 })
  mockGetMixxxChecksumStatus.mockResolvedValue({ present: true, files_checked: 0, drift: [] })

  renderPage()
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Run sync' })).toBeInTheDocument()
  })
  expect(screen.getByRole('button', { name: 'Run sync' })).toBeDisabled()
})
