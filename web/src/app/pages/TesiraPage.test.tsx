import React from 'react'
import { render, screen } from '@testing-library/react'

import { TesiraPage } from './TesiraPage'

jest.mock('../components/Tesira/TesiraApp', () => ({
  TesiraApp: () => <div data-testid="tesira-app">Tesira App</div>,
}))

describe('TesiraPage', () => {
  it('renders Tesira app shell', () => {
    render(<TesiraPage />)
    expect(screen.getByTestId('tesira-app')).toBeTruthy()
  })
})
