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
      pageTransitionPreset: 'staggered-reveal',
    })
    setMatchMedia(false)
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('shows the React Staggered Reveal on eligible landing-route changes', () => {
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/workspace/artifacts')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--staggered')
    expect(document.querySelectorAll('.landing-route-transition__stagger-wash').length).toBeGreaterThan(0)

    act(() => {
      jest.advanceTimersByTime(900)
    })

    expect(screen.queryByTestId('landing-route-transition')).toBeNull()
  })

  it('runs the staggered overlay on MIDI Hub navigations when staggered-reveal is selected', () => {
    renderHarness('/midi-hub/connections')

    fireEvent.click(screen.getByRole('button', { name: 'Go MIDI Presets' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/midi-hub/presets')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--midi-hub')
    // Universal staggered reveal: MIDI Hub no longer gets the legacy
    // lighter-fade downgrade. Operators who want the lighter look can
    // pick Pager Slide or toggle Reduce Effects.
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--staggered')
  })

  it('uses the pager slide preset when selected in effects settings', () => {
    useEffectsSettingsStore.setState({ pageTransitionPreset: 'pager-slide' })
    renderHarness('/')

    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))

    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--pager')
    expect(document.querySelector('.page-transition-scope__content--pager')).not.toBeNull()
  })

  it('runs the universal staggered overlay for previously-unscoped route changes', () => {
    // Generic 'workspace' scope: any navigation not in the four named
    // landing surfaces still gets the universal overlay so the user
    // who chose React Staggered Reveal feels it everywhere.
    renderHarness('/node-ops')

    fireEvent.click(screen.getByRole('button', { name: 'Go Expression' }))

    expect(screen.getByTestId('transition-pathname')).toHaveTextContent('/expression')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--staggered')
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--workspace')
  })

  it('debounces back-to-back overlays inside the rapid-nav window', () => {
    renderHarness('/')
    fireEvent.click(screen.getByRole('button', { name: 'Go Audio Artifacts' }))
    expect(screen.getByTestId('landing-route-transition')).toHaveClass('landing-route-transition--staggered')

    // A second navigation within the suppression window: no new
    // overlay element should be rendered (the in-content universal
    // stagger handles the per-route reveal separately).
    fireEvent.click(screen.getByRole('button', { name: 'Go MIDI Connections' }))
    // The transition timeout is keyed by the previous nav; we have
    // not advanced the clock, so the same overlay (or nothing new)
    // is shown — never two simultaneous overlays.
    expect(screen.queryAllByTestId('landing-route-transition').length).toBeLessThanOrEqual(1)
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
