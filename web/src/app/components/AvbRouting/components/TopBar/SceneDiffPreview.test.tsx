import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SceneDiffPreview } from './SceneDiffPreview'
import { initialRoutingState } from '../../types'
import type { RoutingState } from '../../types'

let mockState: RoutingState
const mockDispatch = jest.fn()

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({
    state: mockState,
    dispatch: mockDispatch,
  }),
}))

describe('SceneDiffPreview', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockState = {
      ...initialRoutingState,
      scenes: {},
      sceneDiff: {
        baseline_scene_id: null,
        compare_scene_id: null,
        preview: null,
        presets: [],
        active_preset_id: null,
      },
    }
  })

  it('renders nothing when scene diff preview is not available', () => {
    render(<SceneDiffPreview />)
    expect(screen.queryByTestId('scene-diff-preview')).toBeNull()
  })

  it('renders read-only scene diff summary when preview exists', () => {
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
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [
            {
              talker_id: 'talker-2',
              listener_id: 'listener-2',
              talker_name: 'Talker Two',
              listener_name: 'Listener Two',
            },
          ],
          to_remove: [
            {
              route_id: 'talker-1→listener-1',
              talker_id: 'talker-1',
              listener_id: 'listener-1',
              talker_name: 'Talker One',
              listener_name: 'Listener One',
            },
          ],
          unchanged: ['talker-3→listener-3'],
          total_changes: 2,
        },
        presets: [
          {
            id: 'preset-a',
            name: 'Ops A/B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-b',
            name: 'Ops Reverse',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            updated_at: '2026-02-17T00:01:00Z',
          },
        ],
        active_preset_id: 'preset-a',
      },
    }

    render(<SceneDiffPreview />)

    expect(screen.getByTestId('scene-diff-preview')).toBeTruthy()
    expect(screen.getByTestId('scene-diff-preview-scope').textContent).toContain('Baseline Scene vs Compare Scene')
    expect(screen.getByTestId('scene-diff-preview-add-count').textContent).toContain('1 add')
    expect(screen.getByTestId('scene-diff-preview-remove-count').textContent).toContain('1 remove')
    expect(screen.getByTestId('scene-diff-preview-unchanged-count').textContent).toContain('1 unchanged')
    expect(screen.getByTestId('scene-diff-preview-add-routes').textContent).toContain('Talker Two -> Listener Two')
    expect(screen.getByTestId('scene-diff-preview-remove-routes').textContent).toContain('Talker One -> Listener One')
    expect(screen.getByTestId('scene-diff-preview-total-changes').textContent).toContain('Total changes: 2')
    expect(screen.getAllByTestId('scene-diff-preview-preset-chip')).toHaveLength(2)
  })

  it('supports quick swap and preset application controls from preview surface', () => {
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
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 0,
        },
        presets: [
          {
            id: 'preset-a',
            name: 'Ops A/B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-a',
      },
    }

    render(<SceneDiffPreview />)

    fireEvent.click(screen.getByTestId('scene-diff-preview-swap'))
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SWAP_SCENE_DIFF_SELECTION' })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })

    fireEvent.click(screen.getByRole('button', { name: 'Ops A/B' }))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: { preset_id: 'preset-a' },
    })
  })
})
