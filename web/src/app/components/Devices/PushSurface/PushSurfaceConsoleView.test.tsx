/**
 * T2489 — PushSurfaceConsoleView smoke test.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { PushSurfaceConsoleView } from './PushSurfaceConsoleView'

jest.mock('../../../pages/PushSurfacePage', () => ({
  PushSurfacePage: () => <div data-testid="push-page-body">push body</div>,
}))

describe('PushSurfaceConsoleView', () => {
  it('renders the manifest title from DeviceLandingHeader', () => {
    render(<PushSurfaceConsoleView />)
    expect(screen.getByRole('heading', { name: 'Ableton Push 3' })).toBeInTheDocument()
  })

  it('renders all 3 purpose lines', () => {
    render(<PushSurfaceConsoleView />)
    expect(screen.getByText(/Pad-grid performance surface/i)).toBeInTheDocument()
    expect(screen.getByText(/Studio-to-stage workflow/i)).toBeInTheDocument()
    expect(screen.getByText(/aftertouch/i)).toBeInTheDocument()
  })

  it('renders the integrated PushSurfacePage body', () => {
    render(<PushSurfaceConsoleView />)
    expect(screen.getByTestId('push-page-body')).toBeInTheDocument()
  })
})
