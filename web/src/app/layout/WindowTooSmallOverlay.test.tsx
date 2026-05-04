import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { WindowTooSmallOverlay } from './WindowTooSmallOverlay'

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

describe('WindowTooSmallOverlay', () => {
  beforeEach(() => {
    // jest-jsdom defaults to 1024×768; bump above the threshold first.
    setViewport(1920, 1080)
  })

  it('renders nothing when viewport is at or above the minimum', () => {
    render(<WindowTooSmallOverlay />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders an alert banner when width drops below 1366', async () => {
    render(<WindowTooSmallOverlay />)
    await act(async () => {
      setViewport(1280, 1024)
      // Wait for the rAF to flush.
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      )
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/1366×768/)
    expect(alert.textContent).toMatch(/1280×1024/)
  })

  it('renders an alert banner when height drops below 768', async () => {
    render(<WindowTooSmallOverlay />)
    await act(async () => {
      setViewport(1920, 600)
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      )
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/1920×600/)
  })
})
