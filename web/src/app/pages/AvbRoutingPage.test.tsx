import React from 'react'
import { render, screen } from '@testing-library/react'
import { AvbRoutingPage } from './AvbRoutingPage'

jest.mock('../components/AvbRouting', () => ({
  AvbRoutingApp: () => {
    const React = require('react')
    const { useTheme } = require('@mui/material/styles')

    function MockAvbRoutingApp() {
      const theme = useTheme()
      return (
        <div data-testid="avb-routing-app">
          <span data-testid="avb-routing-theme-mode">{theme.palette.mode}</span>
          <span data-testid="avb-routing-theme-paper">{theme.palette.background.paper}</span>
        </div>
      )
    }

    return React.createElement(MockAvbRoutingApp)
  },
}))

describe('AvbRoutingPage', () => {
  it('renders AVB routing app shell', () => {
    render(<AvbRoutingPage />)
    expect(screen.getByRole('heading', { name: /unified routing studio/i })).toBeTruthy()
    expect(screen.getByTestId('avb-routing-app')).toBeTruthy()
    expect(screen.getByTestId('avb-routing-theme-mode').textContent).toBe('dark')
    expect(screen.getByTestId('avb-routing-theme-paper').textContent).toBe('#262626')
  })
})
