import { FLOW_CARD_SLOT_COLORS } from './snapshotEditorFlowCard'
import {
  createBlankSnapshotEditorAddEffectDraft,
  createBlankSnapshotEditorDraft,
  resolveSnapshotCreateDraft,
} from './snapshotEditorEntryDraft'

describe('snapshotEditorEntryDraft', () => {
  const normalizationOptions = {
    palette: FLOW_CARD_SLOT_COLORS,
    defaultCount: 3,
    maxFlows: 6,
  } as const

  it('creates a clean blank snapshot draft with default flows and no chains', () => {
    const draft = createBlankSnapshotEditorDraft(normalizationOptions)

    expect(draft.chains).toEqual({})
    expect(draft.activeFlowIndex).toBe(0)
    expect(draft.flowSlots).toHaveLength(3)
    expect(draft.flowSlots.map((slot) => slot.label)).toEqual(['A', 'B', 'C'])
    expect(draft.flowSlots.every((slot) => slot.chainId === null)).toBe(true)
    expect(draft.routing.activeSlotId).toBe(draft.flowSlots[0]?.id ?? null)
    expect(draft.routing.mode).toBe('parallel_blend')
    expect(draft.routing.seriesOrder).toEqual(draft.flowSlots.map((slot) => slot.id))
  })

  it('ignores stale local editor residue when snapshot entry is required', () => {
    const staleDraft = {
      flowSlots: [
        {
          id: 'stale-flow',
          chainId: 401,
          label: 'Z',
          color: '#000',
          muted: true,
          solo: true,
          dryWetMix: 12,
        },
      ],
      routing: {
        mode: 'series',
        activeSlotId: 'stale-flow',
        blendPositions: { 'stale-flow': 12 },
        morphProgress: 0.9,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: ['stale-flow'],
      },
      activeFlowIndex: 0,
      chains: {
        '401': {
          name: 'Stale Chain',
          plugins: [
            {
              uri: 'plugin://stale',
              position: 0,
              bypass: false,
              parameters: {},
              loader_state: {},
            },
          ],
        },
      },
    }

    const resolved = resolveSnapshotCreateDraft(staleDraft as any, true, normalizationOptions)

    expect(resolved).toEqual(createBlankSnapshotEditorDraft(normalizationOptions))
    expect(resolved).not.toBe(staleDraft)
  })

  it('prepares a first-chain draft for add-effect snapshot entry', () => {
    const draft = createBlankSnapshotEditorAddEffectDraft('Rig20260404 - Channel A', normalizationOptions)

    expect(draft.flowSlots[0]?.chainId).toBe(1)
    expect(draft.routing.activeSlotId).toBe(draft.flowSlots[0]?.id ?? null)
    expect(draft.chains).toEqual({
      '1': {
        name: 'Rig20260404 - Channel A',
        plugins: [],
      },
    })
  })
})
