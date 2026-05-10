import React from 'react'
import { act, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { UniversalStaggerProvider } from './UniversalStagger'
import { useEffectsSettingsStore } from '../stores/effectsSettingsStore'

interface AnimateMock extends jest.Mock {
  mock: jest.Mock['mock']
}

function setupAnimateMock(): AnimateMock {
  const finishedPromise = Promise.resolve()
  const animateMock = jest.fn().mockImplementation(() => ({
    finished: finishedPromise,
    cancel: jest.fn(),
    onfinish: null,
    oncancel: null,
  })) as AnimateMock
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animateMock,
  })
  return animateMock
}

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

function StaggerHarness() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <UniversalStaggerProvider />
      <button type="button" onClick={() => navigate('/route-b')}>Go B</button>
      <main>
        <div style={{ display: 'grid' }}>
          <div data-testid="cell-1">A</div>
          <div data-testid="cell-2">B</div>
          <div data-testid="cell-3">C</div>
        </div>
        <div data-testid="path">{location.pathname}</div>
      </main>
    </>
  )
}

describe('UniversalStaggerProvider', () => {
  let animateMock: AnimateMock

  beforeEach(() => {
    window.localStorage.clear()
    useEffectsSettingsStore.setState({
      reducedEffectsEnabled: false,
      pageTransitionPreset: 'staggered-reveal',
      staggerSpeed: 'slow',
    })
    setMatchMedia(false)
    animateMock = setupAnimateMock()
    // jsdom doesn't implement getComputedStyle().display reliably for inline-styled
    // grids; force the value the heuristic expects.
    const realGetComputedStyle = window.getComputedStyle
    jest.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
      const result = realGetComputedStyle.call(window, el as HTMLElement)
      const inlineDisplay = (el as HTMLElement).style?.display
      if (inlineDisplay === 'grid' || inlineDisplay === 'flex') {
        return new Proxy(result, {
          get(target, prop) {
            if (prop === 'display') return inlineDisplay
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

  it('runs the stagger animation on first paint when staggered-reveal is selected', async () => {
    render(
      <MemoryRouter initialEntries={['/route-a']}>
        <Routes>
          <Route path="*" element={<StaggerHarness />} />
        </Routes>
      </MemoryRouter>,
    )

    // First-paint pump: two animation frames before the run executes.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(animateMock).toHaveBeenCalled()
    const firstCall = animateMock.mock.calls[0]
    const keyframes = firstCall[0] as Keyframe[]
    expect(keyframes[0]).toEqual(expect.objectContaining({ opacity: 0 }))
    expect(keyframes[1]).toEqual(expect.objectContaining({ opacity: 1 }))
  })

  it('respects prefers-reduced-motion with a fade-only keyframe', async () => {
    setMatchMedia(true)
    render(
      <MemoryRouter initialEntries={['/route-a']}>
        <Routes>
          <Route path="*" element={<StaggerHarness />} />
        </Routes>
      </MemoryRouter>,
    )

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(animateMock).toHaveBeenCalled()
    const firstCall = animateMock.mock.calls[0]
    const keyframes = firstCall[0] as Keyframe[]
    expect(keyframes[0]).toEqual({ opacity: 0 })
    expect(keyframes[1]).toEqual({ opacity: 1 })
    // No transform when reduced.
    expect(Object.keys(keyframes[0])).not.toContain('transform')
  })

  it('does not run when the preset is not staggered-reveal', async () => {
    useEffectsSettingsStore.setState({
      pageTransitionPreset: 'pager-slide',
      staggerSpeed: 'slow',
    })
    render(
      <MemoryRouter initialEntries={['/route-a']}>
        <Routes>
          <Route path="*" element={<StaggerHarness />} />
        </Routes>
      </MemoryRouter>,
    )

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(animateMock).not.toHaveBeenCalled()
  })
})
