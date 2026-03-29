import {
  buildSnapshotEditorLiveChainProjection,
  getSnapshotEditorDesiredLiveChainIds,
} from './snapshotEditorLiveChains'
import type { Chain } from '../../../map2/types'

function createChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    name: 'Chain 1',
    is_active: true,
    created_at: '2026-03-29T00:00:00Z',
    updated_at: '2026-03-29T00:00:00Z',
    plugins: [],
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: { enabled: true, status: 'active', warnings: [], runtime_items: 0, restored_positions: [], missing_positions: [] },
    ...overrides,
  }
}

describe('snapshotEditorLiveChains', () => {
  it('derives unique desired live chain ids from channel assignments', () => {
    const desired = getSnapshotEditorDesiredLiveChainIds([
      {
        id: 'channel-b',
        chainId: 22,
        label: 'B',
        color: '#22c55e',
        muted: false,
        solo: false,
        dryWetMix: 70,
      },
      {
        id: 'channel-a',
        chainId: 11,
        label: 'A',
        color: '#2563eb',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
      {
        id: 'channel-c',
        chainId: 11,
        label: 'C',
        color: '#f59e0b',
        muted: false,
        solo: false,
        dryWetMix: 40,
      },
    ])

    expect(desired).toEqual([11, 22])
  })

  it('projects live chain labels and runtime health for assigned channels', () => {
    const projection = buildSnapshotEditorLiveChainProjection(
      [
        createChain({
          id: 11,
          name: 'Lead Stack',
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        }),
      ],
      [
        {
          id: 'channel-a',
          chainId: 11,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
    )

    expect(projection).toHaveLength(1)
    expect(projection[0]).toMatchObject({
      chainId: 11,
      chainName: 'Lead Stack',
      status: 'live',
      flowLabels: ['A'],
      primaryFlowLabel: 'A',
      syntheticFlow: false,
    })
    expect(projection[0].representativeItems[0]).toMatchObject({
      kind: 'plugin',
      label: 'NAM',
    })
  })
})
