import type { FlowSnapshotData } from '../../map2/types'
import {
  buildSnapshotComparisonSummary,
  checkSnapshotMorphCompatibility,
  fingerprintSnapshotData,
  interpolateSnapshotData,
} from '../components/JuceGrid/juceGridSnapshots'

function createSnapshot(overrides: Partial<FlowSnapshotData> = {}): FlowSnapshotData {
  return {
    flowSlots: [
      {
        id: 'flow-a',
        chainId: 101,
        label: 'A',
        color: '#0f62fe',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
      {
        id: 'flow-b',
        chainId: 202,
        label: 'B',
        color: '#24a148',
        muted: false,
        solo: false,
        dryWetMix: 80,
      },
    ],
    routing: {
      mode: 'parallel_blend',
      activeSlotId: 'flow-a',
      blendPositions: {
        'flow-a': 70,
        'flow-b': 30,
      },
      morphProgress: 0,
      morphSourceSlotId: 'flow-a',
      morphTargetSlotId: 'flow-b',
      seriesOrder: ['flow-a', 'flow-b'],
    },
    activeFlowIndex: 0,
    chains: {
      '101': {
        name: 'Chain A',
        plugins: [
          {
            uri: 'map2://gain',
            position: 0,
            bypass: false,
            parameters: {
              gain: 0.2,
              mix: 0.6,
            },
          },
        ],
      },
      '202': {
        name: 'Chain B',
        plugins: [
          {
            uri: 'map2://delay',
            position: 0,
            bypass: false,
            parameters: {
              time: 0.35,
            },
          },
        ],
      },
    },
    ...overrides,
  }
}

describe('juceGridSnapshots', () => {
  it('fingerprints equivalent snapshot payloads consistently', () => {
    const source = createSnapshot()
    const reordered = createSnapshot({
      routing: {
        ...source.routing,
        blendPositions: {
          'flow-b': 30,
          'flow-a': 70,
        },
        seriesOrder: ['flow-a', 'flow-b'],
      },
      chains: {
        '202': source.chains['202'],
        '101': source.chains['101'],
      },
    })

    expect(fingerprintSnapshotData(source)).toBe(fingerprintSnapshotData(reordered))
  })

  it('summarizes snapshot differences for dirty-state and compare workflows', () => {
    const source = createSnapshot()
    const target = createSnapshot({
      flowSlots: [
        {
          ...source.flowSlots[0],
          dryWetMix: 65,
        },
        source.flowSlots[1],
      ],
      routing: {
        ...source.routing,
        activeSlotId: 'flow-b',
        blendPositions: {
          'flow-a': 55,
          'flow-b': 45,
        },
      },
      activeFlowIndex: 1,
      chains: {
        ...source.chains,
        '101': {
          ...source.chains['101'],
          plugins: [
            {
              ...source.chains['101'].plugins[0],
              parameters: {
                gain: 0.7,
                mix: 0.6,
              },
            },
          ],
        },
      },
    })

    expect(buildSnapshotComparisonSummary(source, target)).toEqual({
      flowChanges: 1,
      chainChanges: 1,
      paramChanges: 1,
      routingChanged: true,
      activeFlowChanged: true,
    })
  })

  it('rejects morph when compared snapshots do not share plugin order', () => {
    const source = createSnapshot({
      routing: {
        ...createSnapshot().routing,
        mode: 'parameter_morph',
      },
    })
    const target = createSnapshot({
      routing: {
        ...createSnapshot().routing,
        mode: 'parameter_morph',
      },
      chains: {
        ...createSnapshot().chains,
        '101': {
          name: 'Chain A',
          plugins: [
            {
              uri: 'map2://compressor',
              position: 0,
              bypass: false,
              parameters: { threshold: 0.3 },
            },
          ],
        },
      },
    })

    expect(checkSnapshotMorphCompatibility(source, target)).toEqual({
      ok: false,
      reason: 'Morph requires matching plugin order for each compared flow.',
    })
  })

  it('interpolates snapshot values without switching labels or bypass until complete recall', () => {
    const source = createSnapshot({
      routing: {
        ...createSnapshot().routing,
        mode: 'parameter_morph',
      },
    })
    const target = createSnapshot({
      flowSlots: [
        {
          ...source.flowSlots[0],
          label: 'Lead',
          color: '#ff832b',
          dryWetMix: 40,
        },
        source.flowSlots[1],
      ],
      routing: {
        ...source.routing,
        mode: 'parameter_morph',
        activeSlotId: 'flow-b',
        blendPositions: {
          'flow-a': 20,
          'flow-b': 80,
        },
        morphProgress: 1,
        morphSourceSlotId: 'flow-b',
        morphTargetSlotId: 'flow-a',
      },
      activeFlowIndex: 1,
      chains: {
        ...source.chains,
        '101': {
          ...source.chains['101'],
          name: 'Lead Chain',
          plugins: [
            {
              ...source.chains['101'].plugins[0],
              bypass: true,
              parameters: {
                gain: 0.8,
                mix: 0.1,
              },
            },
          ],
        },
      },
    })

    const half = interpolateSnapshotData(source, target, 0.5)

    expect(half.flowSlots[0].dryWetMix).toBe(70)
    expect(half.flowSlots[0].label).toBe('A')
    expect(half.flowSlots[0].color).toBe('#0f62fe')
    expect(half.routing.blendPositions['flow-a']).toBe(45)
    expect(half.routing.morphProgress).toBe(0.5)
    expect(half.routing.activeSlotId).toBe('flow-a')
    expect(half.activeFlowIndex).toBe(0)
    expect(half.chains['101'].plugins[0].parameters.gain).toBeCloseTo(0.5, 5)
    expect(half.chains['101'].plugins[0].bypass).toBe(false)

    const complete = interpolateSnapshotData(source, target, 1)

    expect(complete.flowSlots[0].label).toBe('Lead')
    expect(complete.flowSlots[0].color).toBe('#ff832b')
    expect(complete.routing.activeSlotId).toBe('flow-b')
    expect(complete.activeFlowIndex).toBe(1)
    expect(complete.chains['101'].plugins[0].bypass).toBe(true)
  })
})
