import { act, renderHook } from '@testing-library/react'

import type { SnapshotDraftData } from '../../../map2/types'

import { useSnapshotEditorUndoRedo } from './useSnapshotEditorUndoRedo'

function buildDraft(overrides: Partial<SnapshotDraftData> = {}): SnapshotDraftData {
  return {
    flowSlots: [
      {
        id: 'flow-a',
        chainId: 1,
        label: 'A',
        color: '#00ff00',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
    ],
    routing: {
      mode: 'parallel_blend',
      activeSlotId: 'flow-a',
      blendPositions: { 'flow-a': 100 },
      morphProgress: 0.5,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['flow-a'],
    },
    activeFlowIndex: 0,
    chains: {
      '1': {
        name: 'Clean',
        plugins: [
          {
            uri: 'urn:test:drive',
            position: 0,
            bypass: false,
            parameters: { gain: 0.25 },
            loader_state: {},
          },
        ],
      },
    },
    ...overrides,
  }
}

describe('useSnapshotEditorUndoRedo', () => {
  it('tracks unlimited draft transitions and clears redo on new edits', () => {
    const { result } = renderHook(() => useSnapshotEditorUndoRedo())
    const cleanDraft = buildDraft()
    const mutedDraft = buildDraft({
      flowSlots: [{ ...cleanDraft.flowSlots[0], muted: true }],
    })
    const renamedDraft = buildDraft({
      flowSlots: [{ ...cleanDraft.flowSlots[0], muted: true, label: 'Lead' }],
    })

    act(() => {
      result.current.reset(cleanDraft)
      result.current.push(mutedDraft, 'Mute channel')
      result.current.push(renamedDraft, 'Rename channel')
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undoDescription).toBe('Rename channel')
    expect(result.current.current?.flowSlots[0]?.label).toBe('Lead')

    act(() => {
      const undone = result.current.undo()
      expect(undone?.flowSlots[0]?.label).toBe('A')
      expect(undone?.flowSlots[0]?.muted).toBe(true)
    })

    expect(result.current.canRedo).toBe(true)
    expect(result.current.redoDescription).toBe('Rename channel')

    act(() => {
      result.current.push(buildDraft({
        flowSlots: [{ ...cleanDraft.flowSlots[0], solo: true }],
      }), 'Solo channel')
    })

    expect(result.current.canRedo).toBe(false)
    expect(result.current.current?.flowSlots[0]?.solo).toBe(true)
  })

  it('restores seeded clean state through undo and redo', () => {
    const { result } = renderHook(() => useSnapshotEditorUndoRedo())
    const cleanDraft = buildDraft()
    const changedDraft = buildDraft({
      chains: {
        '1': {
          name: 'Clean',
          plugins: [
            {
              uri: 'urn:test:drive',
              position: 0,
              bypass: true,
              parameters: { gain: 0.75 },
              loader_state: {},
            },
          ],
        },
      },
    })

    act(() => {
      result.current.reset(cleanDraft)
      result.current.push(changedDraft, 'Adjust drive')
    })

    act(() => {
      const undone = result.current.undo()
      expect(undone?.chains['1']?.plugins[0]?.bypass).toBe(false)
      expect(undone?.chains['1']?.plugins[0]?.parameters.gain).toBe(0.25)
    })

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    act(() => {
      const redone = result.current.redo()
      expect(redone?.chains['1']?.plugins[0]?.bypass).toBe(true)
      expect(redone?.chains['1']?.plugins[0]?.parameters.gain).toBe(0.75)
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })
})
