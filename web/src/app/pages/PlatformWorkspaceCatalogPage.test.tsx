import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PlatformWorkspaceCatalogPage } from './PlatformWorkspaceCatalogPage'

const captured: {
  onNavigate?: ((params: { layer?: string; panel?: string } | null) => void) | null
  onLaunchRoute?: ((to: string) => void) | null
  onClose?: (() => void) | null
} = {}

jest.mock('../components/Platform/PlatformModal', () => ({
  PlatformModalContent: (props: {
    initialWorkspaceCatalog?: boolean
    onNavigate?: (params: { layer?: string; panel?: string } | null
    ) => void
    onLaunchRoute?: (to: string) => void
    onClose?: () => void
  }) => {
    captured.onNavigate = props.onNavigate ?? null
    captured.onLaunchRoute = props.onLaunchRoute ?? null
    captured.onClose = props.onClose ?? null

    return (
      <div>
        <div data-testid="workspace-catalog-flag">{String(Boolean(props.initialWorkspaceCatalog))}</div>
        <button type="button" onClick={() => captured.onNavigate?.({ layer: 'overview' })}>navigate-layer</button>
        <button type="button" onClick={() => captured.onNavigate?.({ panel: 'theme' })}>navigate-panel</button>
        <button type="button" onClick={() => captured.onNavigate?.(null)}>navigate-null</button>
        <button type="button" onClick={() => captured.onLaunchRoute?.('/midi-hub')}>launch-route</button>
        <button type="button" onClick={() => captured.onClose?.()}>close</button>
      </div>
    )
  },
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

describe('PlatformWorkspaceCatalogPage', () => {
  beforeEach(() => {
    captured.onNavigate = null
    captured.onLaunchRoute = null
    captured.onClose = null
  })

  it('boots PlatformModalContent in workspace-catalog mode and maps callbacks to route navigation', () => {
    render(
      <MemoryRouter initialEntries={['/platforms/workspace-catalog']}>
        <Routes>
          <Route
            path="*"
            element={(
              <>
                <PlatformWorkspaceCatalogPage />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('workspace-catalog-flag')).toHaveTextContent('true')
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/workspace-catalog')

    fireEvent.click(screen.getByRole('button', { name: 'navigate-layer' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/overview')

    fireEvent.click(screen.getByRole('button', { name: 'navigate-panel' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/theme')

    fireEvent.click(screen.getByRole('button', { name: 'navigate-null' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/workspace-catalog')

    fireEvent.click(screen.getByRole('button', { name: 'launch-route' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/midi-hub')

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
  })
})

