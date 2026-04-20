import { buildTracePath } from './tracePath'

const grid = {
  width: 120,
  height: 80,
}

describe('buildTracePath', () => {
  it('builds a centered series trace', () => {
    const result = buildTracePath(
      {
        cols: 4,
        rows: 5,
        branches: [{ id: 'A', nodes: [{ id: 'drive' }, { id: 'delay' }] }],
      },
      grid,
    )

    expect(result.staticPaths).toHaveLength(1)
    expect(result.staticPaths[0]).toMatchObject({ id: 'A', kind: 'main' })
    expect(result.flowPath).toBe('M 0 40 H 40 H 80 H 120')
  })

  it('routes two branches onto alternating schematic rows', () => {
    const result = buildTracePath(
      {
        cols: 5,
        rows: 5,
        branches: [
          { id: 'A', nodes: [{ id: 'comp' }] },
          { id: 'B', nodes: [{ id: 'verb' }] },
        ],
      },
      grid,
    )

    expect(result.staticPaths.map((path) => path.d)).toEqual([
      'M 0 40 H 30 V 20 H 90 V 40 H 120',
      'M 0 40 H 30 V 60 H 90 V 40 H 120',
    ])
  })

  it('routes three branches through the expected split and merge lanes', () => {
    const result = buildTracePath(
      {
        cols: 5,
        rows: 7,
        branches: [
          { id: 'A', nodes: [{ id: 'drive' }] },
          { id: 'B', nodes: [{ id: 'mod' }] },
          { id: 'C', nodes: [{ id: 'delay' }] },
        ],
      },
      { width: 120, height: 120 },
    )

    expect(result.staticPaths.map((path) => path.d)).toEqual([
      'M 0 60 H 30 V 20 H 90 V 60 H 120',
      'M 0 60 H 30 H 90 H 120',
      'M 0 60 H 30 V 100 H 90 V 60 H 120',
    ])
  })

  it('builds dashed sidechain overlay geometry between branch nodes', () => {
    const result = buildTracePath(
      {
        cols: 5,
        rows: 5,
        branches: [
          { id: 'A', nodes: [{ id: 'send' }] },
          { id: 'B', nodes: [{ id: 'receive' }] },
        ],
        sidechainLinks: [{ id: 'sidechain-a-b', from: { branchId: 'A', nodeId: 'send' }, to: { branchId: 'B', nodeId: 'receive' } }],
      },
      grid,
    )

    expect(result.sidechainPaths).toEqual([
      {
        id: 'sidechain-a-b',
        from: { x: 30, y: 20 },
        to: { x: 30, y: 60 },
        d: 'M 30 20 L 30 60',
      },
    ])
  })

  it('returns a direct empty trace when no branches are present', () => {
    const result = buildTracePath({ cols: 4, rows: 5, branches: [] }, grid)

    expect(result).toEqual({
      staticPaths: [{ id: 'empty', kind: 'empty', d: 'M 0 40 L 120 40' }],
      flowPath: 'M 0 40 L 120 40',
      sidechainPaths: [],
    })
  })
})
