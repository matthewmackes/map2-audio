import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PlatformWorkspaceCatalogPage } from './PlatformWorkspaceCatalogPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

describe('PlatformWorkspaceCatalogPage', () => {
  it('redirects the retired workspace-catalog route to the Platforms overview workspace', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platforms/workspace-catalog']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
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

    expect(await screen.findByTestId('route-probe')).toHaveTextContent('/platforms/overview')
  })
})
