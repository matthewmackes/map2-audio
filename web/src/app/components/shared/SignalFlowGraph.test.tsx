import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { SignalFlowGraph } from './SignalFlowGraph'
import { layoutSignalFlowGraph } from './layoutSignalFlowGraph'

interface FakeNodeData {
  label: string
  onClick?: () => void
}

function FakeNodeBody({ data }: NodeProps<FakeNodeData>) {
  return (
    <button type="button" onClick={() => data.onClick?.()} aria-label={data.label}>
      <Handle type="target" position={Position.Left} />
      {data.label}
      <Handle type="source" position={Position.Right} />
    </button>
  )
}

const nodeTypes = { fake: FakeNodeBody }

function makeNode(id: string, label: string, onClick?: () => void) {
  return {
    id,
    type: 'fake',
    position: { x: 0, y: 0 },
    data: { label, onClick },
    draggable: false,
    selectable: false,
  } as const
}

describe('SignalFlowGraph', () => {
  it('renders the empty state when nodes is empty', () => {
    render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[]}
        edges={[]}
        nodeTypes={nodeTypes}
        emptyState={<div data-testid="fake-empty">no data</div>}
      />,
    )
    expect(screen.getByTestId('fake-empty')).toHaveTextContent('no data')
  })

  it('renders nothing visible when nodes is empty and no emptyState is supplied', () => {
    const { container } = render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[]}
        edges={[]}
        nodeTypes={nodeTypes}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('mounts the wrapper with the supplied class name and density data-attributes', () => {
    const { container } = render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[makeNode('a', 'Alpha'), makeNode('b', 'Bravo')]}
        edges={[{ id: 'a-b', source: 'a', target: 'b' }]}
        nodeTypes={nodeTypes}
        wrapperClassName="my-workspace__graph"
      />,
    )
    const wrapper = container.querySelector('.my-workspace__graph')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.getAttribute('data-density-tier')).toBe('low')
    expect(wrapper?.getAttribute('data-node-count')).toBe('2')
    expect(wrapper?.getAttribute('data-edge-count')).toBe('1')
    expect(wrapper?.className).toContain('react-flow-density--low')
  })

  it('renders the toolbar slot above the canvas', () => {
    render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[makeNode('a', 'Alpha')]}
        edges={[]}
        nodeTypes={nodeTypes}
        toolbar={<div data-testid="fake-toolbar">workspace toolbar</div>}
      />,
    )
    expect(screen.getByTestId('fake-toolbar')).toHaveTextContent('workspace toolbar')
  })

  it('forwards click events to the supplied node body component', () => {
    const onClick = jest.fn()
    render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[makeNode('a', 'Alpha', onClick)]}
        edges={[]}
        nodeTypes={nodeTypes}
      />,
    )
    fireEvent.click(screen.getByLabelText('Alpha'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respects a density override', () => {
    const { container } = render(
      <SignalFlowGraph<FakeNodeData>
        nodes={[makeNode('a', 'Alpha')]}
        edges={[]}
        nodeTypes={nodeTypes}
        wrapperClassName="my-workspace__graph"
        densityOverride={{
          nodeCount: 999,
          edgeCount: 999,
          tier: 'critical',
          showBackground: false,
          showControls: false,
          fitViewDurationMs: 0,
        }}
      />,
    )
    const wrapper = container.querySelector('.my-workspace__graph')
    expect(wrapper?.getAttribute('data-density-tier')).toBe('critical')
    expect(wrapper?.getAttribute('data-node-count')).toBe('999')
  })
})

describe('layoutSignalFlowGraph', () => {
  it('returns input nodes unchanged when given an empty list', () => {
    const out = layoutSignalFlowGraph({
      nodes: [],
      edges: [],
      getNodeSize: () => ({ width: 100, height: 50 }),
    })
    expect(out).toEqual([])
  })

  it('assigns positions to each node based on the supplied size', () => {
    const out = layoutSignalFlowGraph<FakeNodeData>({
      nodes: [makeNode('a', 'Alpha'), makeNode('b', 'Bravo')],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }],
      getNodeSize: () => ({ width: 200, height: 100 }),
    })
    expect(out).toHaveLength(2)
    out.forEach((node) => {
      expect(node.position).toBeDefined()
      expect(typeof node.position.x).toBe('number')
      expect(typeof node.position.y).toBe('number')
    })
  })

  it('reflects the rankdir override in the produced layout', () => {
    const lr = layoutSignalFlowGraph<FakeNodeData>({
      nodes: [makeNode('a', 'Alpha'), makeNode('b', 'Bravo')],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }],
      getNodeSize: () => ({ width: 200, height: 100 }),
      config: { rankdir: 'LR' },
    })
    const tb = layoutSignalFlowGraph<FakeNodeData>({
      nodes: [makeNode('a', 'Alpha'), makeNode('b', 'Bravo')],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }],
      getNodeSize: () => ({ width: 200, height: 100 }),
      config: { rankdir: 'TB' },
    })
    // Under LR, B is to the right of A (Δx > Δy). Under TB, B is below A (Δy > Δx).
    const dxLr = Math.abs(lr[1].position.x - lr[0].position.x)
    const dyLr = Math.abs(lr[1].position.y - lr[0].position.y)
    const dxTb = Math.abs(tb[1].position.x - tb[0].position.x)
    const dyTb = Math.abs(tb[1].position.y - tb[0].position.y)
    expect(dxLr).toBeGreaterThan(dyLr)
    expect(dyTb).toBeGreaterThan(dxTb)
  })

  it('uses per-node sizes from the getNodeSize callback', () => {
    const sizes = jest.fn(() => ({ width: 200, height: 100 }))
    layoutSignalFlowGraph<FakeNodeData>({
      nodes: [makeNode('a', 'Alpha'), makeNode('b', 'Bravo')],
      edges: [],
      getNodeSize: sizes,
    })
    expect(sizes).toHaveBeenCalledTimes(2)
  })
})
