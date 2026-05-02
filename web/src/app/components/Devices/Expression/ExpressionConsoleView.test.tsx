/**
 * T2487-4 — ExpressionConsoleView smoke test.
 *
 * Verifies the unified-shell entry point renders the manifest header
 * and the integrated ExpressionView body without crashing. We mock
 * the heavy ExpressionView so this stays a pure shell-shape test;
 * ExpressionView's behavior is exercised end-to-end by manual /
 * Storybook flows (it depends on TanStack Query + the live API for
 * meaningful assertions, both out of scope for an iter test).
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { ExpressionConsoleView } from './ExpressionConsoleView'

jest.mock('./ExpressionView', () => ({
  ExpressionView: () => <div data-testid="expression-view-body">expression body</div>,
}))

describe('ExpressionConsoleView', () => {
  it('renders the manifest title from DeviceLandingHeader', () => {
    render(<ExpressionConsoleView />)
    expect(screen.getByRole('heading', { name: 'Expression Surface' })).toBeInTheDocument()
  })

  it('renders all 3 purpose lines', () => {
    render(<ExpressionConsoleView />)
    expect(screen.getByText(/expression-pedal layer/i)).toBeInTheDocument()
    expect(screen.getByText(/per-pedal calibration/i)).toBeInTheDocument()
    expect(screen.getByText(/MIDI Services bindings/i)).toBeInTheDocument()
  })

  it('renders the integrated ExpressionView body', () => {
    render(<ExpressionConsoleView />)
    expect(screen.getByTestId('expression-view-body')).toBeInTheDocument()
  })
})
