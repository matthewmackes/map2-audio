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

  it('normalizes save metadata and auto-suffixes duplicate scene names by default', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: ' Baseline<Scene> ' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockNotify.info).toHaveBeenCalledWith('Duplicate name detected. Auto-suffixed to "Baseline Scene (2)".')
    expect(mockNotify.info).toHaveBeenCalledWith('Scene metadata was normalized to remove reserved characters and whitespace.')
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SCENE',
      payload: {
        name: 'Baseline Scene (2)',
        description: 'Saved from TopBar',
        tags: ['topbar'],
      },
    })
  })

  it('supports disabling duplicate auto-suffix policy and keeps duplicate names', () => {
    render(<TopBar />)

    openSceneControls()
    fireEvent.click(screen.getByTestId('topbar-scene-autosuffix-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Baseline Scene' },
    })

    expect(screen.getByTestId('topbar-scene-duplicate-hint').textContent).toContain(
      'Duplicate new-scene name detected. Save will keep duplicate naming.'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    expect(mockNotify.warning).toHaveBeenCalledWith('Scene name "Baseline Scene" already exists. Saving duplicate snapshot name.')
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

    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Scene' }))
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

    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Scene' }))
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

  it('surfaces recent scene operation audit entries with outcome badges', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: { scene_id: 'scene-a' },
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: { scene_id: 'scene-a' },
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(2)
    expect(screen.getByText('Saved scene: Baseline Scene (1 routes)')).toBeTruthy()
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()
    expect(screen.getAllByTestId('topbar-scene-audit-outcome')[0].textContent).toContain('warning')
    expect(screen.getAllByTestId('topbar-scene-audit-outcome')[1].textContent).toContain('success')
  })

  it('filters scene audit entries by search text and validation outcome', async () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: { scene_id: 'scene-a' },
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: { scene_id: 'scene-a' },
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: { scene_id: 'scene-a' },
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('3 of 3 matching (3 total)')

    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'deleted' },
    })
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.click(screen.getByRole("combobox", { name: 'Outcome' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Error' }))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)

    fireEvent.click(screen.getByRole("combobox", { name: 'Outcome' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Success' }))
    expect(screen.queryAllByTestId('topbar-scene-audit-entry')).toHaveLength(0)
    expect(screen.getByText('No scene operations match current audit filters.')).toBeTruthy()
  })

  it('optionally remembers scene-audit filters across scene popover close/open', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'deleted' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    openSceneControls()
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')

    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'deleted' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    openSceneControls()
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('deleted')
  })

  it('supports quick scene-audit filter chips for errors, warnings, and deletes', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_opened',
            phase: 'opened',
            source_count: 2,
          },
          diff_summary: 'Opened scene diff preset import preview (2 rows)',
          validation_outcome: 'success',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-errors'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-warnings'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-deletes'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-diff-preview'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Opened scene diff preset import preview (2 rows)')).toBeTruthy()
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-all'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(3)
  })

  it('supports keyboard activation for scene-audit quick-filter chips', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_opened',
            phase: 'opened',
            source_count: 2,
          },
          diff_summary: 'Opened scene diff preset import preview (2 rows)',
          validation_outcome: 'success',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-errors'), { key: 'Enter' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-warnings'), { key: ' ' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-diff-preview'), { key: 'Enter' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Opened scene diff preset import preview (2 rows)')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-all'), { key: ' ' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(3)
  })

  it('shows compact scene-audit counters in the status strip', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Compare Scene',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-5',
          timestamp: '2026-02-17T00:04:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'popover_closed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning',
        },
      ],
    }

    render(<TopBar />)

    expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 1')
    expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 2')
    expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 2')
    expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
  })

  it('opens scene controls with pre-filtered audit views from status-strip counters', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (3 rows)',
          validation_outcome: 'warning',
        },
      ],
    }

    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-scene-status-errors'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-status-warnings'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-status-deletes'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-status-diff-preview-warnings'))
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Cancelled scene diff preset import preview (3 rows)')).toBeTruthy()
  })

  it('supports keyboard activation for status-strip scene-audit counters', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (3 rows)',
          validation_outcome: 'warning',
        },
      ],
    }

    render(<TopBar />)

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-errors'), { key: 'Enter' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-warnings'), { key: ' ' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-deletes'), { key: 'Enter' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: ' ' })
    expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
    expect(screen.getByText('Cancelled scene diff preset import preview (3 rows)')).toBeTruthy()
  })

  it('overrides remembered stale audit filters for all status-strip counters in one flow', () => {
    mockState = {
      ...mockState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success',
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning',
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE',
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error',
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF',
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (3 rows)',
          validation_outcome: 'warning',
        },
      ],
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-status-errors'))
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-warnings'), { key: 'Enter' })
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
    expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()

    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-status-deletes'))
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
    expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()

    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: 'Enter' })
    expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
    expect(screen.getByText('Cancelled scene diff preset import preview (3 rows)')).toBeTruthy()
  })

  it('shows recall impact preview summary for selected scene', async () => {
    mockState = {
      ...mockState,
      endpoints: {
        'talker-1': { endpoint_id: 'talker-1', device_name: 'Talker 1' },
        'listener-1': { endpoint_id: 'listener-1', device_name: 'Listener 1' },
        'talker-2': { endpoint_id: 'talker-2', device_name: 'Talker 2' },
        'listener-2': { endpoint_id: 'listener-2', device_name: 'Listener 2' },
      },
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
    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))

    expect(screen.getByTestId('topbar-scene-impact-summary').textContent).toContain(
      'Impact: +1 add, -0 remove, =1 unchanged'
    )
    expect(screen.getByTestId('topbar-scene-impact-routes').textContent).toContain('Add: Talker 2 -> Listener 2')
    expect(screen.getByTestId('topbar-scene-impact-routes').textContent).toContain('Remove: none')
  })

  it('expands recall impact details with truncation and paging controls', async () => {
    const makeRoute = (index: number) => ({
      id: `talker-${index}\u2192listener-${index}`,
      talker_id: `talker-${index}`,
      listener_id: `listener-${index}`,
      state: 'connected' as const,
      established_time: null,
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      cross_node: false,
    })

    mockState = {
      ...mockState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: 'Baseline description',
          routes: [1, 2, 3, 4, 5, 6, 7].map(makeRoute),
          timestamp: '2026-02-17T00:00:00Z',
          tags: ['baseline'],
        },
      },
      liveRoutes: {
        'talker-1→listener-1': makeRoute(1),
      },
    }

    render(<TopBar />)

    openSceneControls()
    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.click(screen.getByTestId('topbar-scene-impact-toggle'))

    expect(screen.getAllByTestId('topbar-scene-impact-entry')).toHaveLength(5)
    expect(screen.getByTestId('topbar-scene-impact-truncation').textContent).toContain('Showing 5 of 7 impact entries.')

    fireEvent.click(screen.getByTestId('topbar-scene-impact-show-more'))
    expect(screen.getAllByTestId('topbar-scene-impact-entry')).toHaveLength(7)
    expect(screen.getByTestId('topbar-scene-impact-reset')).toBeTruthy()

    fireEvent.click(screen.getByTestId('topbar-scene-impact-reset'))
    expect(screen.getAllByTestId('topbar-scene-impact-entry')).toHaveLength(5)
  })

  it('requires confirmation before recall and delete dispatch for selected saved scene', async () => {
    render(<TopBar />)

    openSceneControls()

    fireEvent.click(screen.getByRole("combobox", { name: 'Saved Scene' }))
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
