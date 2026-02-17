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

  function openSceneDiffControls() {
    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
  }

  it('dispatches scene-diff baseline/compare selection actions from TopBar controls', async () => {
    render(<TopBar />)

    openSceneDiffControls()

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

  it('warns and blocks generation when scene selections are missing', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    expect(mockNotify.warning).toHaveBeenCalledWith(
      'Select both baseline and compare scenes before generating a diff.'
    )
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
  })

  it('warns and blocks generation when selected scenes are stale', () => {
    const muiWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
        preview: null,
      },
    }

    try {
      render(<TopBar />)

      openSceneDiffControls()
      fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

      expect(mockNotify.warning).toHaveBeenCalledWith(
        'Selected scene is no longer available. Reselect scenes and retry diff generation.'
      )
      expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    } finally {
      muiWarnSpy.mockRestore()
    }
  })

  it('dispatches generate and info notification when scene selections are valid', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    expect(mockNotify.info).toHaveBeenCalledWith('Generated scene diff: Baseline Scene vs Compare Scene.')
  })

  it('dispatches clear scene-diff action', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByTestId('topbar-scene-diff-clear'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_SCENE_DIFF' })
  })

  it('renders inline scene-diff error feedback inside scene-diff controls', () => {
    mockState = {
      ...mockState,
      error: 'Scene diff scene selection is invalid',
    }

    render(<TopBar />)

    openSceneDiffControls()
    expect(screen.getByTestId('topbar-scene-diff-error').textContent).toContain(
      'Scene diff scene selection is invalid'
    )
  })
})
