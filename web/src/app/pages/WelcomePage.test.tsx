import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { WelcomePage } from './WelcomePage'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}{loc.hash}</div>
}

describe('WelcomePage', () => {
  it('redirects legacy /welcome traffic to the unified Home guide anchor', () => {
    render(
      <MemoryRouter
        initialEntries={['/welcome']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('probe').textContent).toBe('/#platform-guide')
  })
})
