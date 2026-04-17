import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryHistory } from 'history'
import { Route, Routes, unstable_HistoryRouter as HistoryRouter, useLocation } from 'react-router-dom'

import {
  isSnapshotFlowRoute,
  usePendingLiveChangesNavigationGuard,
} from './usePendingLiveChangesNavigationGuard'

const LIVE_CHANGES_LEAVE_MESSAGE = 'You have unpublished live changes on this snapshot. Leaving this flow will discard them.'

function GuardHarness({ enabled, snapshotId = 12 }: { enabled: boolean; snapshotId?: number }) {
  const location = useLocation()

  usePendingLiveChangesNavigationGuard({
    when: enabled,
    message: LIVE_CHANGES_LEAVE_MESSAGE,
    allowNavigation: (nextLocation) => isSnapshotFlowRoute(nextLocation.pathname, snapshotId),
  })

  return (
    <div data-testid="guard-location">
      {location.pathname}
      {location.search}
    </div>
  )
}

function renderHarness(
  initialPath = '/snapshots/12/publish?mode=guided',
  enabled = true,
) {
  const history = createMemoryHistory({
    initialEntries: [initialPath],
  })

  render(
    <HistoryRouter history={history}>
      <Routes>
        <Route path="/snapshot-editor" element={<GuardHarness enabled={enabled} snapshotId={12} />} />
        <Route path="/snapshots/:snapshotId/publish" element={<GuardHarness enabled={enabled} snapshotId={12} />} />
        <Route path="/workspace" element={<div data-testid="outside-route">Outside route</div>} />
      </Routes>
    </HistoryRouter>,
  )

  return { history }
}

describe('usePendingLiveChangesNavigationGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('recognizes the allowed snapshot flow routes', () => {
    expect(isSnapshotFlowRoute('/snapshot-editor', 12)).toBe(true)
    expect(isSnapshotFlowRoute('/grid', 12)).toBe(true)
    expect(isSnapshotFlowRoute('/juce-grid', 12)).toBe(true)
    expect(isSnapshotFlowRoute('/snapshots/12/publish', 12)).toBe(true)
    expect(isSnapshotFlowRoute('/snapshots/13/publish', 12)).toBe(false)
    expect(isSnapshotFlowRoute('/workspace', 12)).toBe(false)
  })

  it('allows leaving when the guard is disabled', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const { history } = renderHarness('/snapshots/12/publish', false)

    await act(async () => {
      history.push('/workspace')
    })

    expect(screen.getByTestId('outside-route')).toBeTruthy()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('re-blocks after an allowed in-flow navigation and prevents leaving when the user cancels', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const { history } = renderHarness()

    expect(screen.getByTestId('guard-location').textContent).toBe('/snapshots/12/publish?mode=guided')

    await act(async () => {
      history.push('/snapshots/12/publish?mode=advanced')
    })

    expect(screen.getByTestId('guard-location').textContent).toBe('/snapshots/12/publish?mode=advanced')
    expect(confirmSpy).not.toHaveBeenCalled()

    await act(async () => {
      history.push('/workspace')
    })

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Leaving this flow will discard them'))
    expect(screen.getByTestId('guard-location').textContent).toBe('/snapshots/12/publish?mode=advanced')
    expect(screen.queryByTestId('outside-route')).toBeNull()
  })

  it('registers a beforeunload prompt when live changes are pending', () => {
    renderHarness('/snapshots/12/publish', true)

    const event = new Event('beforeunload', { cancelable: true }) as Event & { returnValue?: unknown }
    let returnValue: unknown = ''
    Object.defineProperty(event, 'returnValue', {
      configurable: true,
      get: () => returnValue,
      set: (value) => {
        returnValue = value
      },
    })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(String(returnValue)).toContain('Leaving this flow will discard them')
  })
})
