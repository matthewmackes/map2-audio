import {
  cloneSnapshotDraftData,
  describeFlowUpdate,
  describeLoaderStateDraftChange,
  extractActivationProgressMetrics,
  fingerprintSnapshotDraftData,
  isTextEntryTarget,
  mergePreviewIntoSnapshotDetail,
  resequenceChainSnapshotPlugins,
  snapshotDraftsEqual,
  updateDraftChain,
} from './snapshotEditorPageHelpers'
import type {
  ChainSnapshot,
  PluginLoaderState,
  SnapshotDetail,
  SnapshotDraftData,
} from '../../../map2/types'

const buildPlugin = (overrides: Partial<{ uri: string; position: number; bypass: boolean }> = {}) => ({
  uri: overrides.uri ?? 'urn:test:plugin',
  position: overrides.position ?? 0,
  bypass: overrides.bypass ?? false,
  parameters: {} as Record<string, number>,
  loader_state: undefined as PluginLoaderState | undefined,
})

const buildDraft = (chainOverrides: Record<string, ChainSnapshot> = {}): SnapshotDraftData => ({
  flowSlots: [],
  routing: {
    mode: 'parallel_blend',
    activeSlotId: null,
    blendPositions: {},
    morphProgress: 0,
    morphSourceSlotId: null,
    morphTargetSlotId: null,
    seriesOrder: [],
  },
  activeFlowIndex: 0,
  chains: chainOverrides,
})

describe('snapshotEditorPageHelpers', () => {
  describe('cloneSnapshotDraftData', () => {
    it('produces an independent deep copy', () => {
      const draft = buildDraft({
        '1': { name: 'chain-1', plugins: [buildPlugin({ position: 0 })] },
      })
      const cloned = cloneSnapshotDraftData(draft)
      expect(cloned).not.toBe(draft)
      expect(cloned.chains['1']).not.toBe(draft.chains['1'])
      expect(cloned).toEqual(draft)
    })
  })

  describe('fingerprintSnapshotDraftData / snapshotDraftsEqual', () => {
    it('equal drafts produce identical fingerprints', () => {
      const left = buildDraft({ '1': { name: 'a', plugins: [] } })
      const right = buildDraft({ '1': { name: 'a', plugins: [] } })
      expect(fingerprintSnapshotDraftData(left)).toBe(fingerprintSnapshotDraftData(right))
      expect(snapshotDraftsEqual(left, right)).toBe(true)
    })

    it('different drafts produce different fingerprints', () => {
      const left = buildDraft({ '1': { name: 'a', plugins: [] } })
      const right = buildDraft({ '1': { name: 'b', plugins: [] } })
      expect(fingerprintSnapshotDraftData(left)).not.toBe(fingerprintSnapshotDraftData(right))
      expect(snapshotDraftsEqual(left, right)).toBe(false)
    })
  })

  describe('resequenceChainSnapshotPlugins', () => {
    it('renumbers plugin positions 0..n-1 preserving order', () => {
      const chain: ChainSnapshot = {
        name: 'c',
        plugins: [
          buildPlugin({ uri: 'a', position: 5 }),
          buildPlugin({ uri: 'b', position: 9 }),
          buildPlugin({ uri: 'c', position: 2 }),
        ],
      }
      const result = resequenceChainSnapshotPlugins(chain)
      expect(result.plugins.map(p => p.position)).toEqual([0, 1, 2])
      expect(result.plugins.map(p => p.uri)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('updateDraftChain', () => {
    it('mutates an existing chain via the updater', () => {
      const draft = buildDraft({
        '7': { name: 'old', plugins: [] },
      })
      const result = updateDraftChain(draft, 7, (chain) => ({ ...chain, name: 'new' }))
      expect(result.chains['7'].name).toBe('new')
    })

    it('returns the draft unchanged when the chain id is missing', () => {
      const draft = buildDraft({
        '7': { name: 'old', plugins: [] },
      })
      const result = updateDraftChain(draft, 99, (chain) => ({ ...chain, name: 'new' }))
      expect(result.chains['7'].name).toBe('old')
    })
  })

  describe('describeLoaderStateDraftChange', () => {
    it.each([
      ['map2://juce/nam', 'Assign NAM model'],
      ['urn:map2:nam-player', 'Assign NAM model'],
      ['map2://juce/convolution/cabinet', 'Assign cabinet IR'],
      ['urn:map2:ir-cabinet', 'Assign cabinet IR'],
      ['map2://juce/convolution/reverb', 'Assign reverb IR'],
      ['urn:map2:ir-reverb', 'Assign reverb IR'],
      ['unknown://plugin', 'Update loader state'],
    ])('maps %s -> %s', (uri, expected) => {
      expect(describeLoaderStateDraftChange(uri)).toBe(expected)
    })
  })

  describe('mergePreviewIntoSnapshotDetail', () => {
    it('returns the preview when no base snapshot exists', () => {
      const preview = { id: 1, name: 'preview' } as unknown as SnapshotDetail
      expect(mergePreviewIntoSnapshotDetail(preview, null)).toBe(preview)
    })

    it('overlays preview chain data on the base snapshot, but preserves base id/metadata', () => {
      const base = {
        id: 42,
        name: 'live',
        description: 'live-desc',
        tags: ['a'],
        program_number: 7,
        chains: [{ id: 1, name: 'live-chain', plugins: [] }],
        is_active: true,
      } as unknown as SnapshotDetail
      const preview = {
        id: 999,
        name: 'preview',
        description: 'preview-desc',
        tags: [],
        program_number: 999,
        chains: [{ id: 1, name: 'preview-chain', plugins: [] }],
        is_active: false,
      } as unknown as SnapshotDetail
      const merged = mergePreviewIntoSnapshotDetail(preview, base)
      expect(merged.id).toBe(42)
      expect(merged.name).toBe('live')
      expect(merged.program_number).toBe(7)
      expect(merged.is_active).toBe(true)
      // Preview-side fields (chains) come through:
      expect((merged as unknown as { chains: { name: string }[] }).chains[0].name).toBe('preview-chain')
    })
  })

  describe('describeFlowUpdate', () => {
    it.each([
      [{ label: 'A' }, 'Rename channel'],
      [{ chainId: 1 }, 'Reassign channel'],
      [{ chainId: null }, 'Reassign channel'],
      [{ solo: true }, 'Enable channel solo'],
      [{ solo: false }, 'Disable channel solo'],
      [{ muted: true }, 'Mute channel'],
      [{ muted: false }, 'Unmute channel'],
      [{ dryWetMix: 0.5 }, 'Adjust channel mix'],
      [{}, 'Edit channel'],
    ])('describes %p as %s', (updates, expected) => {
      expect(describeFlowUpdate(updates)).toBe(expected)
    })
  })

  describe('isTextEntryTarget', () => {
    it('returns false for null + non-HTMLElement', () => {
      expect(isTextEntryTarget(null)).toBe(false)
      expect(isTextEntryTarget({} as EventTarget)).toBe(false)
    })
    it('returns true for INPUT / TEXTAREA / SELECT', () => {
      expect(isTextEntryTarget(document.createElement('input'))).toBe(true)
      expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true)
      expect(isTextEntryTarget(document.createElement('select'))).toBe(true)
    })
    it('returns true for an element whose isContentEditable getter is true', () => {
      // JSDOM does not propagate `contentEditable = "true"` into the
      // isContentEditable getter without attaching the element to a
      // document; assert the read path directly.
      const div = document.createElement('div')
      Object.defineProperty(div, 'isContentEditable', { value: true })
      expect(isTextEntryTarget(div)).toBe(true)
    })
    it('returns false for plain non-editable elements', () => {
      expect(isTextEntryTarget(document.createElement('div'))).toBe(false)
      expect(isTextEntryTarget(document.createElement('button'))).toBe(false)
    })
  })

  describe('extractActivationProgressMetrics', () => {
    it('returns null for missing / non-object payloads', () => {
      expect(extractActivationProgressMetrics(null)).toBeNull()
      expect(extractActivationProgressMetrics(undefined)).toBeNull()
      expect(extractActivationProgressMetrics({})).toBeNull()
      expect(extractActivationProgressMetrics({ runtime_metrics: 'oops' as unknown as Record<string, unknown> })).toBeNull()
    })

    it('returns null when activation_progress is missing or invalid', () => {
      expect(extractActivationProgressMetrics({ runtime_metrics: {} })).toBeNull()
      expect(extractActivationProgressMetrics({
        runtime_metrics: { activation_progress: [] },
      })).toBeNull()
    })

    it('uppercases current_phase + completed_phases, lowercases status, trims note', () => {
      const result = extractActivationProgressMetrics({
        runtime_metrics: {
          activation_progress: {
            current_phase: 'staging',
            status: 'IN_PROGRESS',
            note: '   chain swap   ',
            completed_phases: ['validating', 'STAGING'],
          },
        },
      })
      expect(result).toEqual({
        currentPhase: 'STAGING',
        status: 'in_progress',
        note: 'chain swap',
        completedPhases: ['VALIDATING', 'STAGING'],
      })
    })

    it('coerces non-string fields to null', () => {
      const result = extractActivationProgressMetrics({
        runtime_metrics: {
          activation_progress: {
            current_phase: 42,
            status: false,
            note: '   ',
            completed_phases: ['valid', 7, null],
          },
        },
      })
      expect(result).toEqual({
        currentPhase: null,
        status: null,
        note: null,
        completedPhases: ['VALID'],
      })
    })
  })
})
