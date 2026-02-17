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

describe('TopBar scene management controls', () => {
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
      liveRoutes: {
        'talker-1→listener-1': {
          id: 'talker-1→listener-1',
          talker_id: 'talker-1',
          listener_id: 'listener-1',
          state: 'connected',
          established_time: null,
          error_message: null,
          connection_count: 1,
          srp_reservation_id: null,
          srp_admission_id: null,
          locked: false,
          valid: true,
          messages: [],
          cross_node: false,
        },
      },
      pendingRoutes: {},
      safePatchMode: false,
    }
  })

  function openSceneControls() {
    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
  }

  it('dispatches SAVE_SCENE with draft name and emits success feedback', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Operator Snapshot' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE',
      payload: {
        name: 'Operator Snapshot',
        description: 'Saved from TopBar',
        tags: ['topbar'],
      },
    })
    expect(mockNotify.success).toHaveBeenCalledWith('Saved scene "Operator Snapshot" (1 routes).')
  })

  it('uses deterministic fallback scene name when save draft is empty', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE',
      payload: {
        name: 'Scene 3',
        description: 'Saved from TopBar',
        tags: ['topbar'],
      },
    })
  })

  it('dispatches recall and delete for selected saved scene', async () => {
    render(<TopBar />)

    openSceneControls()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    fireEvent.click(screen.getByTestId('topbar-scene-recall'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'RECALL_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'DELETE_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Recalled scene "Baseline Scene".')
    expect(mockNotify.info).toHaveBeenCalledWith('Deleted scene "Baseline Scene".')
  })

  it('warns when recall/delete are requested without a selected scene', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.click(screen.getByTestId('topbar-scene-recall'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Select a saved scene before recalling.')
    expect(mockNotify.warning).toHaveBeenCalledWith('Select a saved scene before deleting.')
  })

  it('shows baseline/compare status and stale readiness in the scene strip', () => {
    mockState = {
      ...mockState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
        preview: null,
      },
    }

    render(<TopBar />)

    expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('1 scene')
    expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline: Baseline Scene')
    expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare: Missing')
    expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection stale')
  })
})
