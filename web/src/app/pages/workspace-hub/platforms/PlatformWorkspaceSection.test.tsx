import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PlatformWorkspaceSection } from './PlatformWorkspaceSection'
import { HOST_MACHINE_ROUTE } from '../../hostMachineRoutes'

const mockPlatformModalContent = jest.fn()

jest.mock('../../../components/Platform/PlatformModal', () => ({
  PlatformModalContent: (props: {
    surface?: 'route' | 'modal'
    renderSidebar?: boolean
    initialLayer: string | null
    initialPanel: string | null
    onNavigate: (params: { layer?: string | null; panel?: string | null } | null) => void
    onClose: () => void
  }) => mockPlatformModalContent(props),
}))

function RouteProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{location.pathname}</div>
}

// Nav reorg 2026-05-03 (second pass) — `PlatformWorkspaceSection` is
// now mounted at `/node-ops/:workspace` (was `/workspace/platforms/:workspace`).
// Internal navigation from the section uses `buildWorkspaceHubPlatformPath`
// which returns the canonical `/node-ops/<id>` path.

describe('PlatformWorkspaceSection', () => {
  beforeEach(() => {
    mockPlatformModalContent.mockImplementation(({ initialLayer, initialPanel, onNavigate, onClose }) => (
      <div>
        <RouteProbe />
        <div data-testid="platform-content">{`${initialLayer ?? 'none'}|${initialPanel ?? 'none'}`}</div>
        <button type="button" onClick={() => onNavigate({ layer: 'audio-engine' })}>Go audio engine</button>
        <button type="button" onClick={() => onNavigate(null)}>Go overview</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    ))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('mounts the platform route body on the canonical /node-ops path', () => {
    render(
      <MemoryRouter initialEntries={['/node-ops/overview']}>
        <Routes>
          <Route path="/node-ops/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('platform-content')).toHaveTextContent('overview|none')
    expect(mockPlatformModalContent).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'route',
      renderSidebar: false,
    }))
  })

  it('keeps in-section navigation on the canonical /node-ops path', () => {
    render(
      <MemoryRouter initialEntries={['/node-ops/overview']}>
        <Routes>
          <Route path="/node-ops/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go audio engine' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/node-ops/audio-engine')

    fireEvent.click(screen.getByRole('button', { name: 'Go overview' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/node-ops/overview')
  })

  it('redirects unknown workspace ids back to the overview workspace', () => {
    render(
      <MemoryRouter initialEntries={['/node-ops/api-observatory']}>
        <Routes>
          <Route path="/node-ops/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/node-ops/overview')
  })

  it('hard-redirects the retired host-machine workspace into Hardware', () => {
    render(
      <MemoryRouter initialEntries={['/node-ops/host-machine']}>
        <Routes>
          <Route path="/node-ops/:workspace" element={<PlatformWorkspaceSection />} />
          <Route path={HOST_MACHINE_ROUTE} element={<RouteProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('route-probe')).toHaveTextContent(HOST_MACHINE_ROUTE)
  })
})
