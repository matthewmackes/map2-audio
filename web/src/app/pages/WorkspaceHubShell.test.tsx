import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import {
  WorkspaceHubIndexRedirect,
  WorkspaceHubPlaceholder,
  WorkspaceHubShell,
} from './WorkspaceHubShell'

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

describe('WorkspaceHubShell', () => {
  it('redirects the bare /workspace route into the platforms overview scaffold', async () => {
    render(
      <MemoryRouter initialEntries={['/workspace']}>
        <Routes>
          <Route path="/workspace/*" element={<WorkspaceHubShell />}>
            <Route index element={<WorkspaceHubIndexRedirect />} />
            <Route
              path="platforms/overview"
              element={<WorkspaceHubPlaceholder title="Platforms" subtitle="Overview scaffold" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Platforms' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview', current: 'page' })).toHaveAttribute('href', '/workspace/platforms/overview')
  })

  it('renders flat section dividers and keeps the targeted workspace link active', async () => {
    render(
      <MemoryRouter initialEntries={['/workspace/outboard-hardware']}>
        <Routes>
          <Route path="/workspace/*" element={<WorkspaceHubShell />}>
            <Route
              path="outboard-hardware"
              element={<WorkspaceHubPlaceholder title="Outboard Hardware" subtitle="Overview scaffold" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Platforms', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Physical Surfaces', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Audio Artifacts', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(screen.getByText('Outboard Hardware', { selector: '.workspace-hub-nav__divider' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Outboard Hardware' })).toBeInTheDocument()

    const links = screen.getAllByRole('link', { name: 'Overview' })
    expect(links).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Overview', current: 'page' })).toHaveAttribute('href', '/workspace/outboard-hardware')
  })
})
