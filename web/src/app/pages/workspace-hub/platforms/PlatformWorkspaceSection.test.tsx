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

  it('mounts the platform route body on the canonical /workspace/platforms path', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/platforms/overview']}>
        <Routes>
          <Route path="/workspace/platforms/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('platform-content')).toHaveTextContent('overview|none')
    expect(mockPlatformModalContent).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'route',
      renderSidebar: false,
    }))
  })

  it('keeps in-section navigation on the canonical workspace path', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/platforms/overview']}>
        <Routes>
          <Route path="/workspace/platforms/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go audio engine' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/workspace/platforms/audio-engine')

    fireEvent.click(screen.getByRole('button', { name: 'Go overview' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('redirects unknown workspace ids back to the overview workspace', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/platforms/api-observatory']}>
        <Routes>
          <Route path="/workspace/platforms/:workspace" element={<PlatformWorkspaceSection />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('hard-redirects the retired workspace host-machine route into Hardware', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/platforms/host-machine']}>
        <Routes>
          <Route path="/workspace/platforms/:workspace" element={<PlatformWorkspaceSection />} />
          <Route path={HOST_MACHINE_ROUTE} element={<RouteProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('route-probe')).toHaveTextContent(HOST_MACHINE_ROUTE)
  })
})
