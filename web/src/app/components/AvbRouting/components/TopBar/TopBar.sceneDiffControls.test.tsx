import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import { initialRoutingState } from '../../types'
import type { RoutingState } from '../../types'

let mockState: RoutingState
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
  useAvbDevices: () => ({
    data: {
      available: true,
      count: 0,
      device_names: [],
      discovered_count: 0,
      discovered_devices: [],
    },
  }),
  useAvbStreams: () => ({
    data: {
      available: true,
      streams: [],
    },
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
        presets: [],
        active_preset_id: null,
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

    fireEvent.click(screen.getByRole("combobox", { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_SCENE_DIFF_BASELINE',
      payload: 'scene-a',
    })

    fireEvent.click(screen.getByRole("combobox", { name: 'Compare Scene' }))
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
        presets: [],
        active_preset_id: null,
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

  it('swaps baseline/compare selections and regenerates preview when both are selected', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByTestId('topbar-scene-diff-swap'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SWAP_SCENE_DIFF_SELECTION' })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    expect(mockNotify.info).toHaveBeenCalledWith('Swapped baseline and compare scene selections.')
  })

  it('saves scene diff presets from selected baseline/compare scenes', async () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-name-input'), {
      target: { value: 'Ops Compare Pair' },
    })
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-notes-input'), {
      target: { value: 'Stage-left compare set' },
    })
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-version-input'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole("combobox", { name: 'Conflict Policy' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Rename' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-save'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE_DIFF_PRESET',
      payload: {
        name: 'Ops Compare Pair',
        notes: 'Stage-left compare set',
        preset_version: 3,
        preferred_conflict_action: 'rename',
      },
    })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    expect(mockNotify.info).toHaveBeenCalledWith('Saved scene diff preset "Ops Compare Pair".')
  })

  it('applies and deletes selected scene diff presets', async () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()

    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ops Preset A' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-apply'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: {
        preset_id: 'preset-a',
      },
    })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_SCENE_DIFF' })
    expect(mockNotify.info).toHaveBeenCalledWith('Applied scene diff preset "Ops Preset A".')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-delete'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'DELETE_SCENE_DIFF_PRESET',
      payload: {
        preset_id: 'preset-a',
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Deleted scene diff preset "Ops Preset A".')
  })

  it('shows saved preset conflict policy values in the preset summary area', async () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
          {
            id: 'preset-b',
            name: 'Ops Preset B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()

    expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary-label').textContent).toContain(
      'Saved preset conflict policies'
    )
    expect(screen.getByTestId('topbar-scene-diff-preset-policy-chip-preset-a').textContent).toContain(
      'Ops Preset A: Rename'
    )
    expect(screen.getByTestId('topbar-scene-diff-preset-policy-chip-preset-b').textContent).toContain(
      'Ops Preset B: Upsert'
    )
    expect(screen.getByLabelText('Ops Preset A conflict policy Rename')).toBeTruthy()
    expect(screen.getByLabelText('Ops Preset B conflict policy Upsert')).toBeTruthy()
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: none'
    )
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'No preset selected. Draft conflict policy applies to next save/import defaults.'
    )

    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ops Preset A' }))

    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Rename'
    )
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'Draft conflict policy matches persisted preset metadata.'
    )
  })

  it('resets preset conflict policy draft to default upsert before save', async () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ops Preset A' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'Draft conflict policy matches persisted preset metadata.'
    )
    expect((screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset') as HTMLButtonElement).disabled).toBe(
      false
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset'))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Upsert')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'Draft conflict policy differs (draft: Upsert). Save Preset to persist.'
    )
    expect((screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset') as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(screen.getByLabelText('Use Default Upsert')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-save'))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE_DIFF_PRESET',
      payload: expect.objectContaining({
        name: 'Ops Preset A',
        preferred_conflict_action: 'upsert',
      }),
    })
  })

  it('preserves draft conflict policy edits across scene-diff popover close and reopen', async () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ops Preset A' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset'))
    fireEvent.click(screen.getByRole("combobox", { name: 'Conflict Policy' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Skip' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Skip')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-close'))
    openSceneDiffControls()

    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Skip')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Rename'
    )
  })

  it('exports scene diff presets to JSON transfer payload', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-export'))

    const transferField = screen.getByTestId('topbar-scene-diff-preset-transfer-input') as HTMLInputElement
    expect(transferField.value).toContain('"schema_version": 1')
    expect(transferField.value).toContain('"preferred_conflict_action": "upsert"')
    expect(transferField.value).toContain('"name": "Ops Preset A"')
    expect(transferField.value).toContain('"preset_version": 1')
    expect(transferField.value).toContain('"preferred_conflict_action": "rename"')
    expect(mockNotify.info).toHaveBeenCalledWith('Exported 1 scene diff preset to JSON.')
  })

  it('previews and imports valid scene diff presets from JSON while skipping invalid entries', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: ' Imported Preset ',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            notes: 'Imported note',
            preset_version: 2,
            preferred_conflict_action: 'rename',
          },
          { name: 'Missing Compare', baseline_scene_id: 'scene-a', compare_scene_id: 'scene-missing' },
          { name: '', baseline_scene_id: 'scene-a', compare_scene_id: 'scene-b' },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-summary').textContent).toContain('3 source')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-accepted-count').textContent).toContain('1 accepted')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-count').textContent).toContain('0 conflict')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-skipped-count').textContent).toContain('2 skipped')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-schema').textContent).toContain('legacy-array')
    expect(screen.getAllByTestId('topbar-scene-diff-import-preview-row')).toHaveLength(3)
    expect(mockNotify.info).toHaveBeenCalledWith('Previewed 3 preset rows: 1 accepted, 0 conflict, 2 skipped.')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Imported Preset',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            notes: 'Imported note',
            preset_version: 2,
            preferred_conflict_action: 'rename',
          },
        ],
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Imported 1 scene diff preset.')
    expect(mockNotify.warning).toHaveBeenCalledWith('Skipped 2 invalid or non-resolvable preset entries.')
  })

  it('dispatches scene-diff preview lifecycle audit events for open/refresh/cancel flows', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Imported Preset',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
        ]),
      },
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: '[]' },
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: expect.objectContaining({
        phase: 'opened',
        source_count: 1,
      }),
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: expect.objectContaining({
        phase: 'refreshed',
        source_count: 1,
      }),
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: expect.objectContaining({
        phase: 'cancelled',
        reason: 'transfer_draft_changed',
      }),
    })
  })

  it('previews conflict upserts before import and reports conflict remediation', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            notes: 'Old mapping',
            preset_version: 1,
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            notes: 'New mapping',
            preset_version: 5,
          },
        ]),
      },
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-count').textContent).toContain('1 conflict')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-detail').textContent).toContain(
      'Existing: scene-a -> scene-b (v1)'
    )
    expect(screen.getByTestId('topbar-scene-diff-import-preview-row-status').textContent).toContain('conflict')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            notes: 'New mapping',
            preset_version: 5,
          },
        ],
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Upserted 1 preset name conflict during import.')
  })

  it('applies advisory preferred_conflict_action wrapper metadata on preview defaults', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'skip',
          presets: [
            {
              name: 'Ops Existing',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-policy-hint').textContent).toContain(
      'Conflict policy hint: skip (advisory)'
    )
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
  })

  it('applies per-row preferred_conflict_action hints over wrapper defaults', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'upsert',
          presets: [
            {
              name: 'Ops Existing',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
              preferred_conflict_action: 'skip',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-policy-hint').textContent).toContain(
      'Conflict policy hint: upsert (advisory)'
    )
    expect(screen.getByTestId('topbar-scene-diff-import-preview-row-conflict-policy-hint-row-1').textContent).toContain(
      'Conflict policy hint: skip (row override; wrapper default upsert)'
    )
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
  })

  it('sorts preview rows into conflict/accepted/skipped groups for operator triage', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Valid New',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
          {
            name: 'Missing Compare',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    const statuses = screen
      .getAllByTestId('topbar-scene-diff-import-preview-row-status')
      .map((entry) => (entry.textContent || '').trim())
    expect(statuses).toEqual(['conflict', 'accepted', 'skipped'])

    const groups = screen
      .getAllByTestId('topbar-scene-diff-import-preview-group-heading')
      .map((entry) => (entry.textContent || '').trim())
    expect(groups).toEqual(['Conflict Rows', 'Accepted Rows', 'Skipped Rows'])
  })

  it('updates import-plan summary chips live as conflict actions change', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
          },
          {
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-skip-row-2'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
  })

  it('applies per-row conflict actions (rename/skip) before import dispatch', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            notes: 'Old A',
            preset_version: 1,
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            notes: 'Old B',
            preset_version: 1,
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            notes: 'New A',
            preset_version: 4,
          },
          {
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            notes: 'New B',
            preset_version: 5,
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Ops Existing A Copy' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-skip-row-2'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Ops Existing A Copy',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
            notes: 'New A',
            preset_version: 4,
          },
        ],
      },
    })
    expect(mockNotify.info).toHaveBeenCalledWith('Imported 1 scene diff preset.')
    expect(mockNotify.info).toHaveBeenCalledWith('Renamed 1 conflict preset before import.')
    expect(mockNotify.warning).toHaveBeenCalledWith('Skipped 1 conflict preset by operator action.')
  })

  it('paginates large import preview payloads with deterministic page controls', () => {
    render(<TopBar />)

    const payload = Array.from({ length: 13 }, (_, index) => ({
      name: `Preset ${index + 1}`,
      baseline_scene_id: 'scene-a',
      compare_scene_id: 'scene-b',
    }))

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-12 of 13 visible rows (13 total)'
    )
    expect(screen.getByText('Preset 1')).toBeTruthy()
    expect(screen.queryByText('Preset 13')).toBeNull()

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 13-13 of 13 visible rows (13 total)'
    )
    expect(screen.getByText('Preset 13')).toBeTruthy()
    expect(screen.queryByText('Preset 1')).toBeNull()

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-prev'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-12 of 13 visible rows (13 total)'
    )
  })

  it('toggles grouped preview visibility and recomputes visible-row summary', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Valid New',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
          {
            name: 'Missing Compare',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-3 of 3 visible rows (3 total)'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-conflict'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-2 of 2 visible rows (3 total)'
    )
    expect(
      screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
    ).toEqual(['accepted', 'skipped'])

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-accepted'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-1 of 1 visible rows (3 total)'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 0-0 of 0 visible rows (3 total)'
    )
    expect(screen.queryAllByTestId('topbar-scene-diff-import-preview-row')).toHaveLength(0)
  })

  it('supports keyboard activation for preview group toggles and bulk conflict actions', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Valid New',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-conflict'), { key: 'Enter' })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-1 of 1 visible rows (2 total)'
    )

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-conflict'), { key: ' ' })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
      'Showing 1-2 of 2 visible rows (2 total)'
    )

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-skip'), { key: 'Enter' })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
  })

  it('supports bulk conflict actions and keeps import-plan chips in sync', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
          },
          {
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-skip'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 2')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-upsert'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-rename'))
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 2')
    expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')

    expect((screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value).toContain('Imported')
    expect((screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2') as HTMLInputElement).value).toContain('Imported')
  })

  it('renders inline rename validation errors and clears once remediated', () => {
    mockState = {
      ...mockState,
      sceneDiff: {
        ...mockState.sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Existing',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Ops Existing',
            baseline_scene_id: 'scene-b',
            compare_scene_id: 'scene-a',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))

    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-valid-row-1').textContent).toContain(
      'Rename target is valid.'
    )

    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: '' },
    })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1').textContent).toContain(
      'Scene name is required.'
    )

    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Ops Existing' },
    })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1').textContent).toContain(
      'already exists'
    )

    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Ops Existing Copy' },
    })
    expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-valid-row-1').textContent).toContain(
      'Rename target is valid.'
    )
  })

  it('warns and blocks import when preview has not been generated', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Imported Preset',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Preview preset JSON before importing.')
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: expect.anything(),
    })
  })

  it('warns on invalid preset JSON syntax during preview', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: '{invalid-json}' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Preset JSON is invalid. Fix syntax and retry preview.')
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: expect.anything(),
    })
  })

  it('rejects unsupported schema_version wrapper payloads during preview', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 2,
          compatibility_hint: 'Upgrade exporter',
          presets: [
            {
              name: 'Imported Preset',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Unsupported preset schema_version 2. Expected schema_version 1.')
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: expect.anything(),
    })
  })

  it('rejects invalid preferred_conflict_action metadata during preview', () => {
    render(<TopBar />)

    openSceneDiffControls()
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'force-merge',
          presets: [
            {
              name: 'Imported Preset',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    expect(mockNotify.warning).toHaveBeenCalledWith(
      'Preset JSON preferred_conflict_action must be one of: upsert, rename, skip.'
    )
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: expect.anything(),
    })
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
