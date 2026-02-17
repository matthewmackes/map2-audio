import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import { initialRoutingState } from '../../types'

let mockState: any
let mockCanUndo = false
let mockCanRedo = false

const mockDispatch = jest.fn()
const mockMutate = jest.fn()
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
  useCanUndo: () => mockCanUndo,
  useCanRedo: () => mockCanRedo,
}))

jest.mock('../../hooks/useAvbApi', () => ({
  useBatchPatchMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}))

jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}))

jest.mock('./NodeSelector', () => ({
  NodeSelector: () => <div data-testid="mock-node-selector">node-selector</div>,
}))

jest.mock('../NetworkTopology/NetworkTopologyModal', () => ({
  NetworkTopologyModal: () => null,
}))

jest.mock('./SceneDiffPreview', () => ({
  SceneDiffPreview: () => null,
}))

describe('TopBar scene diff controls', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockMutate.mockReset()
    mockNotify.success.mockReset()
    mockNotify.error.mockReset()
    mockNotify.warning.mockReset()
    mockNotify.info.mockReset()
    mockCanUndo = false
    mockCanRedo = false

    mockState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: null,
        compare_scene_id: null,
        preview: null,
      },
      endpoints: {},
      liveRoutes: {},
      pendingRoutes: {},
      safePatchMode: false,
    }
  })

  it('dispatches scene-diff baseline/compare selection actions from TopBar controls', async () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_SCENE_DIFF_BASELINE',
      payload: 'scene-a',
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_SCENE_DIFF_COMPARE',
      payload: 'scene-b',
    })
  })

  it('dispatches generate and clear scene-diff actions', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-clear'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_SCENE_DIFF' })
  })
})
