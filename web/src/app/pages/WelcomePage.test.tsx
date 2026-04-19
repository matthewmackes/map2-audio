import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { WelcomePage } from './WelcomePage'

describe('WelcomePage', () => {
  it('redirects legacy /welcome traffic to /about', () => {
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
          <Route path="/about" element={<div>About target</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('About target')).toBeTruthy()
  })
})
