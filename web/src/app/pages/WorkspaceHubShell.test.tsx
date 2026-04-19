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
      'physical-surfaces': {
        key: 'physical-surfaces',
        label: 'Physical Surfaces',
        metric: '3 units',
        detail: '1 notification · 2 online units',
        tone: 'positive',
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
      'outboard-hardware': {
        key: 'outboard-hardware',
        label: 'Outboard Hardware',
        metric: '5 devices',
        detail: '3 hardware classes · 2 audio interfaces',
        tone: 'info',
        isLoading: false,
        isError: false,
      },
    },
    orderedSummaries: [],
    physicalSurfaces: {
      summary: null,
      isLoading: false,
      isError: false,
    },
  }

  return {
    ...data,
    orderedSummaries: [
      data.summaries.platforms,
      data.summaries['physical-surfaces'],
      data.summaries.artifacts,
      data.summaries['outboard-hardware'],
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

  it('redirects the bare /workspace route into the platforms overview scaffold', async () => {
    render(
      <MemoryRouter
        initialEntries={['/workspace']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/workspace/*" element={<WorkspaceHubShell />}>
            <Route index element={<WorkspaceHubIndexRedirect />} />
            <Route
              path="platforms/overview"
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

  it('renders routed workspace content without the legacy title strip chrome', async () => {
    render(
      <MemoryRouter
        initialEntries={['/workspace/artifacts?category=snapshots']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/workspace/*" element={<WorkspaceHubShell />}>
            <Route
              path="artifacts"
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
