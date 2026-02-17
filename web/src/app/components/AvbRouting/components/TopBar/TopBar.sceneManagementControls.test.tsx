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
          description: 'Baseline description',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: ['baseline'],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: 'Compare description',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: ['compare'],
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

  it('blocks save when scene name exceeds configured limit', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'x'.repeat(65) },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Scene name cannot exceed 64 characters.')
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'SAVE_SCENE',
      payload: expect.anything(),
    })
  })

  it('normalizes save metadata and warns on duplicate scene names', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: ' Baseline<Scene> ' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Scene name "Baseline Scene" already exists. Saving duplicate snapshot name.')
    expect(mockNotify.info).toHaveBeenCalledWith('Scene metadata was normalized to remove reserved characters and whitespace.')
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE',
      payload: {
        name: 'Baseline Scene',
        description: 'Saved from TopBar',
        tags: ['topbar'],
      },
    })
  })

  it('filters saved scenes by search query for large inventories', async () => {
    render(<TopBar />)

    openSceneControls()
    expect(screen.getByTestId('topbar-scene-search-summary').textContent).toContain('2 scenes')

    fireEvent.change(screen.getByTestId('topbar-scene-search-input'), {
      target: { value: 'compare' },
    })
    expect(screen.getByTestId('topbar-scene-search-summary').textContent).toContain('1 of 2 scenes')

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    expect(await screen.findByRole('option', { name: 'Compare Scene' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Baseline Scene' })).toBeNull()

    fireEvent.change(screen.getByTestId('topbar-scene-search-input'), {
      target: { value: 'does-not-exist' },
    })
    expect(screen.getByTestId('topbar-scene-search-summary').textContent).toContain('0 of 2 scenes')
  })

  it('updates selected scene metadata from TopBar controls', async () => {
    render(<TopBar />)

    openSceneControls()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    fireEvent.change(screen.getByTestId('topbar-scene-edit-name-input'), {
      target: { value: 'Baseline Scene Renamed' },
    })
    fireEvent.change(screen.getByTestId('topbar-scene-edit-description-input'), {
      target: { value: 'Updated baseline description' },
    })
    fireEvent.change(screen.getByTestId('topbar-scene-edit-tags-input'), {
      target: { value: 'critical, stage-left,  monitor ' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-update'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-a',
        name: 'Baseline Scene Renamed',
        description: 'Updated baseline description',
        tags: ['critical', 'stage-left', 'monitor'],
      },
    })
    expect(mockNotify.success).toHaveBeenCalledWith('Updated scene metadata for "Baseline Scene Renamed".')
  })

  it('shows recall impact preview summary for selected scene', async () => {
    mockState = {
      ...mockState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: 'Baseline description',
          routes: [
            {
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
            {
              id: 'talker-2→listener-2',
              talker_id: 'talker-2',
              listener_id: 'listener-2',
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
          ],
          timestamp: '2026-02-17T00:00:00Z',
          tags: ['baseline'],
        },
      },
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    expect(screen.getByTestId('topbar-scene-impact-summary').textContent).toContain(
      'Impact: +1 add, -0 remove, =1 unchanged'
    )
    expect(screen.getByTestId('topbar-scene-impact-routes').textContent).toContain('Add: talker-2→listener-2')
    expect(screen.getByTestId('topbar-scene-impact-routes').textContent).toContain('Remove: none')
  })

  it('requires confirmation before recall and delete dispatch for selected saved scene', async () => {
    render(<TopBar />)

    openSceneControls()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    fireEvent.click(screen.getByTestId('topbar-scene-recall'))

    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'RECALL_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockNotify.warning).toHaveBeenCalledWith('Confirm recall for "Baseline Scene" to replace current live routes.')
    expect(screen.getByTestId('topbar-scene-impact-text').textContent).toContain(
      'Confirm recall to replace current live routes with "Baseline Scene".'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-recall'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'RECALL_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Recalled scene "Baseline Scene".')

    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'DELETE_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockNotify.warning).toHaveBeenCalledWith('Confirm delete for "Baseline Scene" to permanently remove this snapshot.')

    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'DELETE_SCENE',
      payload: {
        scene_id: 'scene-a',
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Deleted scene "Baseline Scene".')
  })

  it('warns when recall/delete are requested without selection and keeps metadata update disabled', () => {
    render(<TopBar />)

    openSceneControls()
    expect(screen.getByTestId('topbar-scene-update')).toHaveProperty('disabled', true)
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
