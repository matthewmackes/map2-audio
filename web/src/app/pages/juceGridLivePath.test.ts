import { buildJuceGridLivePath, type JuceGridLivePathFlow } from './juceGridLivePath'

function createFlow(
  id: string,
  overrides: Partial<JuceGridLivePathFlow> = {},
): JuceGridLivePathFlow {
  return {
    id,
    label: id.toUpperCase(),
    color: '#0f62fe',
    muted: false,
    solo: false,
    chainId: Number(id.charCodeAt(0)),
    dryWetMix: 100,
    ...overrides,
  }
}

describe('buildJuceGridLivePath', () => {
  it('keeps series order for eligible flows and dims muted context', () => {
    const layout = buildJuceGridLivePath({
      flows: [
        createFlow('a'),
        createFlow('b', { muted: true }),
        createFlow('c'),
      ],
      mode: 'series',
      seriesOrder: ['c', 'a', 'b'],
      activeFlowId: 'a',
    })

    expect(layout.status).toBe('available')
    expect(layout.orderedFlowIds).toEqual(['c', 'a', 'b'])
    expect(layout.activeFlowIds).toEqual(['c', 'a'])
    expect(layout.groups.map((group) => ({ kind: group.kind, flowIds: group.flowIds }))).toEqual([
      { kind: 'series', flowIds: ['c', 'a'] },
      { kind: 'inactive', flowIds: ['b'] },
    ])
    expect(layout.flowStates.b.annotation).toBe('Muted')
  })

  it('uses only solo branches as active in parallel blend mode', () => {
    const layout = buildJuceGridLivePath({
      flows: [
        createFlow('a', { solo: true }),
        createFlow('b'),
        createFlow('c'),
      ],
      mode: 'parallel_blend',
      blendPositions: {
        a: 65,
        b: 35,
        c: 0,
      },
      activeFlowId: 'b',
    })

    expect(layout.activeFlowIds).toEqual(['a'])
    expect(layout.orderedFlowIds).toEqual(['a', 'b', 'c'])
    expect(layout.flowStates.a.activeAudio).toBe(true)
    expect(layout.flowStates.b.annotation).toBe('Dimmed by solo')
    expect(layout.flowStates.c.secondaryAnnotation).toBe('0% blend')
  })

  it('keeps morph target dimmed until morph progress rises above zero', () => {
    const layout = buildJuceGridLivePath({
      flows: [
        createFlow('a'),
        createFlow('b'),
        createFlow('c'),
      ],
      mode: 'parameter_morph',
      morphProgress: 0,
      morphSourceId: 'b',
      morphTargetId: 'c',
    })

    expect(layout.orderedFlowIds).toEqual(['b', 'c', 'a'])
    expect(layout.activeFlowIds).toEqual(['b'])
    expect(layout.flowStates.b.annotation).toBe('Morph source')
    expect(layout.flowStates.c.annotation).toBe('Morph target')
    expect(layout.flowStates.c.dimmed).toBe(true)
    expect(layout.mobileSummary).toEqual(['Morph 0%: B -> C'])
  })

  it('separates sidechain key flow from the main audio path', () => {
    const layout = buildJuceGridLivePath({
      flows: [
        createFlow('a'),
        createFlow('b'),
        createFlow('c', { muted: true }),
      ],
      mode: 'sidechain',
      activeFlowId: 'a',
    })

    expect(layout.primaryFlowId).toBe('a')
    expect(layout.secondaryFlowId).toBe('b')
    expect(layout.groups.map((group) => group.kind)).toEqual(['series', 'sidechain', 'inactive'])
    expect(layout.flowStates.a.annotation).toBe('Main audio')
    expect(layout.flowStates.b.sidechainKey).toBe(true)
    expect(layout.mobileSummary).toEqual(['Sidechain: audio A, key B'])
  })

  it('reports unavailable when all branches are muted out of the live path', () => {
    const layout = buildJuceGridLivePath({
      flows: [
        createFlow('a', { muted: true }),
        createFlow('b', { muted: true }),
      ],
      mode: 'series',
    })

    expect(layout.status).toBe('unavailable')
    expect(layout.activeFlowIds).toEqual([])
    expect(layout.mobileSummary).toEqual(['Live path unavailable'])
  })
})
