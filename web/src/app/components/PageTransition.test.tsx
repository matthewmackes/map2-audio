import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { PageTransition } from './PageTransition'
import { useEffectsSettingsStore } from '../stores/effectsSettingsStore'

jest.mock('../performance/devDiagnostics', () => ({
  markRouteRenderReady: jest.fn(),
  markRouteRenderStart: jest.fn(),
  reportRouteRequestVolume: jest.fn(),
}))

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

function TransitionHarness() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <div data-testid="transition-pathname">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/workspace/artifacts')}>Go Audio Artifacts</button>
      <button type="button" onClick={() => navigate('/midi-hub/connections')}>Go MIDI Connections</button>
      <button type="button" onClick={() => navigate('/midi-hub/presets')}>Go MIDI Presets</button>
      <button type="button" onClick={() => navigate('/expression')}>Go Expression</button>
      <PageTransition>
        <div data-testid="transition-body">{location.pathname}</div>
      </PageTransition>
    </>
  )
}

function renderHarness(initialEntry: string) {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="*" element={<TransitionHarness />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageTransition', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    window.localStorage.clear()
    useEffectsSettingsStore.setState({
      reducedEffectsEnabled: false,
      pageTransitionPreset: 'hyperactive-block',
    })
    setMatchMedia(false)
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('shows the Hyperactive Block Reveal on eligible landing-route changes', () => {
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/workspace/artifacts')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--block')
    expect(document.querySelectorAll('.landing-route-transition__block-icon').length).toBeGreaterThan(0)

    act(() => {
      jest.advanceTimersByTime(900)
    })

    expect(screen.queryByTestId('landing-route-transition')).toBeNull()
  })

  it('animates navigation within the MIDI Hub route family', () => {
    renderHarness('/midi-hub/connections')

    fireEvent.click(screen.getByRole('button', { name: 'Go MIDI Presets' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/midi-hub/presets')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--midi-hub')
  })

  it('uses the pager slide preset when selected in effects settings', () => {
    useEffectsSettingsStore.setState({ pageTransitionPreset: 'pager-slide' })
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--pager')
    expect(document.querySelector('.page-transition-scope__content--pager')).not.toBeNull()
  })

  it('skips the transition for unrelated route changes', () => {
    renderHarness('/about')

    fireEvent.click(screen.getByRole('button', { name: 'Go Expression' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/expression')
    expect(screen.queryByTestId('landing-route-transition')).toBeNull()
  })

  it('falls back to the minimal fade when system reduced motion is enabled', () => {
    setMatchMedia(true)
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--fade')
  })

  it('falls back to the minimal fade when saved reduced-effects mode is enabled', () => {
    useEffectsSettingsStore.setState({
      reducedEffectsEnabled: true,
      pageTransitionPreset: 'pager-slide',
    })
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--fade')
  })
})
