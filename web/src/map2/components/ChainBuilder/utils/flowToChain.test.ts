import { createAudioPluginNode } from '../nodes/AudioPluginNodeTypes'
import { flowToChainOrder, hasOrderChanged } from './flowToChain'

function createPluginNode(
  id: string,
  uri: string,
  position: number,
  x: number,
  instanceId?: number,
) {
  return createAudioPluginNode(
    id,
    {
      plugin: {
        uri,
        name: id,
        position,
        bypassed: false,
        parameters: {},
        instance_id: instanceId,
      },
      isSelected: false,
      isBypassed: false,
      inputPorts: 2,
      outputPorts: 2,
      onRemove: () => undefined,
      onToggleBypass: () => undefined,
      onOpenParameters: () => undefined,
    },
    { x, y: 0 },
  )
}

describe('flowToChainOrder', () => {
  it('returns positioned plugin refs so duplicate URIs remain distinguishable', () => {
    const nodes = [
      createPluginNode('duplicate-b', 'plugin://duplicate', 1, 240, 1002),
      createPluginNode('duplicate-a', 'plugin://duplicate', 0, 0, 1001),
      createPluginNode('widener', 'plugin://widener', 2, 480, 1003),
    ]

    expect(flowToChainOrder(nodes)).toEqual([
      { uri: 'plugin://duplicate', position: 0 },
      { uri: 'plugin://duplicate', position: 1 },
      { uri: 'plugin://widener', position: 2 },
    ])
  })

  it('detects order changes using per-instance identity instead of URI strings alone', () => {
    const previousNodes = [
      createPluginNode('duplicate-a', 'plugin://duplicate', 0, 0, 1001),
      createPluginNode('duplicate-b', 'plugin://duplicate', 1, 240, 1002),
    ]
    const currentNodes = [
      createPluginNode('duplicate-b', 'plugin://duplicate', 1, 0, 1002),
      createPluginNode('duplicate-a', 'plugin://duplicate', 0, 240, 1001),
    ]

    expect(hasOrderChanged(previousNodes, currentNodes)).toBe(true)
  })
})
