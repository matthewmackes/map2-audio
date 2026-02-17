import React from 'react'
import { render, screen } from '@testing-library/react'
import { AvbRoutingPage } from './AvbRoutingPage'

jest.mock('../components/AvbRouting', () => ({
  AvbRoutingApp: () => <div data-testid="avb-routing-app">AVB Routing App</div>,
}))

describe('AvbRoutingPage', () => {
  it('renders AVB routing app shell', () => {
    render(<AvbRoutingPage />)
    expect(screen.getByTestId('avb-routing-app')).toBeTruthy()
  })
})
