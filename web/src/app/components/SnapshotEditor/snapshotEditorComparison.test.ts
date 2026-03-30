import type { SnapshotDraftData } from '../../../map2/types'
import {
  buildSnapshotComparisonSummary,
  checkSnapshotMorphCompatibility,
  interpolateSnapshotData,
} from './snapshotEditorComparison'

function buildDraft(overrides: Partial<SnapshotDraftData> = {}): SnapshotDraftData {
  return {
    flowSlots: [
      {
        id: 'ch_a',
        chainId: 1,
        label: 'A',
        color: '#2563eb',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
      {
        id: 'ch_b',
        chainId: 2,
        label: 'B',
        color: '#22c55e',
        muted: false,
        solo: false,
        dryWetMix: 75,
      },
    ],
    routing: {
      mode: 'parallel_blend',
      activeSlotId: 'ch_a',
      blendPositions: { ch_a: 100, ch_b: 75 },
      morphProgress: 0.5,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['ch_a', 'ch_b'],
    },
    activeFlowIndex: 0,
    chains: {
      '1': {
        name: 'Path A',
        plugins: [
          {
            uri: 'urn:test:a',
            position: 0,
            bypass: false,
            parameters: { gain: 0.2 },
          },
        ],
      },
      '2': {
        name: 'Path B',
        plugins: [
          {
            uri: 'urn:test:b',
            position: 0,
            bypass: false,
            parameters: { mix: 0.5 },
          },
        ],
      },
    },
    ...overrides,
  }
}

describe('snapshotEditorComparison', () => {
  it('reports path-first comparison fields', () => {
    const source = buildDraft()
    const target = buildDraft({
      flowSlots: [
        {
          ...source.flowSlots[0],
          label: 'Main',
        },
        {
          ...source.flowSlots[1],
          dryWetMix: 60,
        },
      ],
      activeFlowIndex: 1,
      chains: {
        ...source.chains,
        '2': {
          name: 'Wet Path',
          plugins: [
            {
              uri: 'urn:test:b',
              position: 0,
              bypass: true,
              parameters: { mix: 0.8 },
            },
          ],
        },
      },
    })

    const summary = buildSnapshotComparisonSummary(source, target)

    expect(summary.pathChanges).toBe(2)
    expect(summary.chainChanges).toBe(1)
    expect(summary.paramChanges).toBe(2)
    expect(summary.activePathChanged).toBe(true)
  })

  it('uses path wording for morph compatibility failures and interpolates drafts', () => {
    const source = buildDraft()
    const incompatible = buildDraft({
      flowSlots: [source.flowSlots[0]],
    })

    expect(checkSnapshotMorphCompatibility(source, incompatible)).toEqual({
      ok: false,
      reason: 'Morph requires the same number of paths in both snapshots.',
    })

    const target = buildDraft({
      flowSlots: [
        source.flowSlots[0],
        {
          ...source.flowSlots[1],
          dryWetMix: 25,
        },
      ],
      chains: {
        ...source.chains,
        '2': {
          ...source.chains['2'],
          plugins: [
            {
              ...source.chains['2'].plugins[0],
              parameters: { mix: 0.9 },
            },
          ],
        },
      },
    })

    const interpolated = interpolateSnapshotData(source, target, 0.5)
    expect(interpolated.flowSlots[1].dryWetMix).toBe(50)
    expect(interpolated.chains['2'].plugins[0].parameters.mix).toBeCloseTo(0.7)
  })
})
