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

jest.mock('../layout/ShellWindowContext', () => ({
  ShellWindowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('../components/shared/ShellWindowTitleStrip', () => ({
  ShellWindowTitleStrip: () => null,
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
    expect(screen.getByRole('link', { name: 'Overview', current: 'page' })).toHaveAttribute('href', '/workspace/platforms/overview')
    expect(screen.getByRole('link', { name: 'Audio Engine' })).toHaveAttribute('href', '/workspace/platforms/audio-engine')
    expect(screen.getByRole('link', { name: 'Host Machine' })).toHaveAttribute('href', '/workspace/platforms/host-machine')
    expect(screen.getByRole('link', { name: 'Platform Guide' })).toHaveAttribute('href', '/workspace/platforms/about')
    expect(screen.getByLabelText('Workspace summaries')).toBeInTheDocument()
    expect(screen.getByText('6 metrics')).toBeInTheDocument()
    expect(screen.getByLabelText('Platforms summary')).toHaveTextContent('4 layers · 1 alert')
  })

  it('renders full imported section nav entries and keeps the targeted workspace link active', async () => {
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

    expect(screen.getByText('Platforms', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Physical Surfaces', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Audio Artifacts', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Outboard Hardware', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ableton Push' })).toHaveAttribute('href', '/workspace/physical-surfaces/ableton-push')
    expect(screen.getByRole('link', { name: 'Snapshots', current: 'page' })).toHaveAttribute('href', '/workspace/artifacts?category=snapshots')
    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/workspace/artifacts/discover')
    expect(screen.getByRole('link', { name: 'Tesira AVB' })).toHaveAttribute('href', '/workspace/outboard-hardware/biamp-tesira')
    expect(screen.getByRole('link', { name: 'MPX1 Rack' })).toHaveAttribute('href', '/workspace/outboard-hardware/lexicon-mpx1')
  })
})
