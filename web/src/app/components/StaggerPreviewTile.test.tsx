import React from 'react'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { StaggerPreviewTile } from './StaggerPreviewTile'

describe('StaggerPreviewTile', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        finished: Promise.resolve(),
        cancel: jest.fn(),
        onfinish: null,
        oncancel: null,
      })),
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    // The grid container relies on `display: grid` from a CSS file that
    // jsdom doesn't apply, so report it manually via getComputedStyle.
    const realGetComputedStyle = window.getComputedStyle
    jest.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
      const result = realGetComputedStyle.call(window, el as HTMLElement)
      const className = (el as HTMLElement).className ?? ''
      if (typeof className === 'string' && className.includes('stagger-preview-tile__grid')) {
        return new Proxy(result, {
          get(target, prop) {
            if (prop === 'display') return 'grid'
            return Reflect.get(target, prop)
          },
        }) as CSSStyleDeclaration
      }
      return result
    }) as typeof window.getComputedStyle)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the preview cells and the replay button', () => {
    render(<StaggerPreviewTile speed="slow" />)

    expect(screen.getByTestId('stagger-preview-grid')).toBeInTheDocument()
    expect(screen.getByText('Live preview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replay staggered reveal preview' })).toBeInTheDocument()
    expect(screen.getByText('Channel A')).toBeInTheDocument()
    expect(screen.getByText('Channel F')).toBeInTheDocument()
  })

  it('shows the Reduced motion badge when reduced=true', () => {
    render(<StaggerPreviewTile speed="slow" reduced />)
    expect(screen.getByTestId('stagger-preview-reduced-badge')).toHaveTextContent('Reduced motion')
  })

  it('does not show the Reduced motion badge in the default state', () => {
    render(<StaggerPreviewTile speed="slow" />)
    expect(screen.queryByTestId('stagger-preview-reduced-badge')).toBeNull()
  })

  it('runs the staggered animation on the cells and re-runs on replay', async () => {
    render(<StaggerPreviewTile speed="slow" />)

    const animateMock = HTMLElement.prototype.animate as jest.Mock
    // Initial run animates 6 cells.
    expect(animateMock.mock.calls.length).toBeGreaterThanOrEqual(1)

    const initialCalls = animateMock.mock.calls.length

    await act(async () => {
      screen.getByRole('button', { name: 'Replay staggered reveal preview' }).click()
    })

    expect(animateMock.mock.calls.length).toBeGreaterThan(initialCalls)
  })
})
