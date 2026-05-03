import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import {
  WorkspaceHubIndexRedirect,
  WorkspaceHubShell,
} from './WorkspaceHubShell'
import type { UnifiedWorkspaceData } from '../hooks/useUnifiedWorkspaceData'

jest.mock('../theme', () => ({
  useTheme: () => ({
    theme: {
      carbonTheme: 'g100',
    },
  }),
  toCarbonBaseTheme: (carbonTheme: string) => (carbonTheme === 'white' || carbonTheme === 'g10' ? 'white' : 'g100'),
}))

const mockUseUnifiedWorkspaceData = jest.fn<UnifiedWorkspaceData, []>()

jest.mock('../hooks/useUnifiedWorkspaceData', () => ({
  useUnifiedWorkspaceData: () => mockUseUnifiedWorkspaceData(),
}))

function buildWorkspaceData(): UnifiedWorkspaceData {
  const data: UnifiedWorkspaceData = {
    summaries: {
      platforms: {
        key: 'platforms',
        label: 'Platforms',
        metric: '6 metrics',
        detail: '4 layers · 1 alert',
        tone: 'warning',
        isLoading: false,
        isError: false,
      },
      artifacts: {
        key: 'artifacts',
        label: 'Audio Artifacts',
        metric: '12 assets',
        detail: '2 native plugins · 4 soundfonts',
        tone: 'positive',
        isLoading: false,
        isError: false,
      },
    },
    orderedSummaries: [],
  }

  return {
    ...data,
    orderedSummaries: [
      data.summaries.platforms,
      data.summaries.artifacts,
    ],
  }
}

function WorkspaceStubSection({ title, summaryLabel }: { title: string; summaryLabel: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div aria-label={`${title} summary`}>{summaryLabel}</div>
    </section>
  )
}

describe('WorkspaceHubShell', () => {
  beforeEach(() => {
    mockUseUnifiedWorkspaceData.mockImplementation(buildWorkspaceData)
  })

  // Nav reorg 2026-05-03 (second pass) — `WorkspaceHubShell` is now
  // mounted at `/node-ops/*` (was `/workspace/*`). The index redirect
  // points at `/node-ops/overview`. Audio Artifacts has its own
  // top-level `/artifacts/*` mount that also uses this same shell.
  it('redirects the bare /node-ops route into the canonical overview', async () => {
    render(
      <MemoryRouter
        initialEntries={['/node-ops']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/node-ops/*" element={<WorkspaceHubShell />}>
            <Route index element={<WorkspaceHubIndexRedirect />} />
            <Route
              path="overview"
              element={<WorkspaceStubSection title="Platforms" summaryLabel="4 layers · 1 alert" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Platforms' })).toBeInTheDocument()
    expect(document.querySelector('.window-title-strip')).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    expect(screen.queryByLabelText('Workspace summaries')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Platforms summary')).toHaveTextContent('4 layers · 1 alert')
  })

  it('renders routed artifacts content without the legacy title strip chrome', async () => {
    render(
      <MemoryRouter
        initialEntries={['/artifacts?category=snapshots']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/artifacts/*" element={<WorkspaceHubShell />}>
            <Route
              index
              element={<WorkspaceStubSection title="Audio Artifacts" summaryLabel="2 native plugins · 4 soundfonts" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()
    expect(screen.getByLabelText('Audio Artifacts summary')).toHaveTextContent('2 native plugins · 4 soundfonts')
    expect(document.querySelector('.window-title-strip')).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
  })
})
