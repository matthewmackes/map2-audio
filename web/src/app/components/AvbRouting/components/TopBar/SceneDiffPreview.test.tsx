import React from 'react'
import { render, screen } from '@testing-library/react'
import { SceneDiffPreview } from './SceneDiffPreview'
import { initialRoutingState } from '../../types'

let mockState: any

jest.mock('../../context/RoutingContext', () => ({
  useRoutingState: () => mockState,
}))

describe('SceneDiffPreview', () => {
  beforeEach(() => {
    mockState = {
      ...initialRoutingState,
      scenes: {},
      sceneDiff: {
        baseline_scene_id: null,
        compare_scene_id: null,
        preview: null,
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
  })
})
