import { initialRoutingState } from '../types'
import { routingReducer } from './routingReducer'

function cloneState() {
  return {
    ...initialRoutingState,
    selection: {
      ...initialRoutingState.selection,
    },
  }
}

describe('routingReducer selection focus/hover behavior', () => {
  it('sets keyboard focus without changing hover', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        hoveredCell: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
      },
    }

    const next = routingReducer(state, {
      type: 'FOCUS_CELL',
      payload: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
    })

    expect(next.selection.focusedCell).toEqual({
      talker_id: 'talker-focus',
      listener_id: 'listener-focus',
    })
    expect(next.selection.hoveredCell).toEqual({
      talker_id: 'talker-hover',
      listener_id: 'listener-hover',
    })
  })

  it('sets hover without changing keyboard focus', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        focusedCell: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
      },
    }

    const next = routingReducer(state, {
      type: 'HOVER_CELL',
      payload: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
    })

    expect(next.selection.hoveredCell).toEqual({
      talker_id: 'talker-hover',
      listener_id: 'listener-hover',
    })
    expect(next.selection.focusedCell).toEqual({
      talker_id: 'talker-focus',
      listener_id: 'listener-focus',
    })
  })

  it('clear selection resets both hover and focus', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        hoveredCell: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
        focusedCell: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
      },
    }

    const next = routingReducer(state, {
      type: 'CLEAR_SELECTION',
    })

    expect(next.selection.hoveredCell).toBeNull()
    expect(next.selection.focusedCell).toBeNull()
    expect(next.selection.selectedEndpoints).toEqual([])
    expect(next.selection.selectedRoutes).toEqual([])
  })
})
