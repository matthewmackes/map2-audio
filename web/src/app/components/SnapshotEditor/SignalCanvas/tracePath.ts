export interface TraceNode {
  id: string
  col?: number
  row?: number
}

export interface TraceBranch {
  id: string
  nodes: TraceNode[]
  row?: number
}

export interface TraceEndpoint {
  branchId?: string
  branchIndex?: number
  nodeId?: string
  nodeIndex?: number
  col?: number
  row?: number
}

export interface TraceSidechainLink {
  id?: string
  from: TraceEndpoint
  to: TraceEndpoint
}

export interface TracePathInput {
  branches: TraceBranch[]
  cols: number
  rows: number
  bypassedNodeIds?: Iterable<string>
  sidechainLinks?: TraceSidechainLink[]
}

export interface TraceGridPixels {
  width: number
  height: number
  paddingX?: number
  paddingY?: number
}

export interface TracePathSegment {
  id: string
  d: string
  branchId?: string
  kind: 'main' | 'bypass' | 'empty'
}

export interface TraceSidechainPath {
  id: string
  d: string
  from: TracePoint
  to: TracePoint
}

export interface TracePoint {
  x: number
  y: number
}

export interface BuiltTracePath {
  staticPaths: TracePathSegment[]
  flowPath: string
  sidechainPaths: TraceSidechainPath[]
}

interface ResolvedTraceNode extends TraceNode {
  col: number
  row: number
}

interface ResolvedTraceBranch extends TraceBranch {
  nodes: ResolvedTraceNode[]
  row: number
}

const MIN_GRID_SIZE = 2

export function buildTracePath(input: TracePathInput, gridPixels: TraceGridPixels): BuiltTracePath {
  const cols = Math.max(MIN_GRID_SIZE, Math.floor(input.cols))
  const rows = Math.max(1, Math.floor(input.rows))
  const branches = resolveBranches(input.branches, cols, rows)
  const staticPaths: TracePathSegment[] = []
  const bypassedNodeIds = new Set(input.bypassedNodeIds ?? [])

  if (branches.length === 0) {
    const row = Math.floor(rows / 2)
    const d = linePath([pointForCell(0, row, cols, rows, gridPixels), pointForCell(cols - 1, row, cols, rows, gridPixels)])
    return {
      staticPaths: [{ id: 'empty', d, kind: 'empty' }],
      flowPath: d,
      sidechainPaths: [],
    }
  }

  for (const branch of branches) {
    const points = [
      pointForCell(0, Math.floor(rows / 2), cols, rows, gridPixels),
      pointForCell(1, branch.row, cols, rows, gridPixels),
      ...branch.nodes.map((node) => pointForCell(node.col, node.row, cols, rows, gridPixels)),
      pointForCell(cols - 2, branch.row, cols, rows, gridPixels),
      pointForCell(cols - 2, Math.floor(rows / 2), cols, rows, gridPixels),
      pointForCell(cols - 1, Math.floor(rows / 2), cols, rows, gridPixels),
    ]

    staticPaths.push({
      id: branch.id,
      branchId: branch.id,
      kind: 'main',
      d: orthogonalPath(points),
    })

    for (const node of branch.nodes) {
      if (bypassedNodeIds.has(node.id)) {
        staticPaths.push({
          id: `${branch.id}:${node.id}:bypass`,
          branchId: branch.id,
          kind: 'bypass',
          d: bypassOutlinePath(pointForCell(node.col, node.row, cols, rows, gridPixels), gridPixels),
        })
      }
    }
  }

  return {
    staticPaths,
    flowPath: staticPaths.filter((path) => path.kind === 'main').map((path) => path.d).join(' '),
    sidechainPaths: (input.sidechainLinks ?? []).map((link, index) => buildSidechainPath(link, index, branches, cols, rows, gridPixels)),
  }
}

function resolveBranches(branches: TraceBranch[], cols: number, rows: number): ResolvedTraceBranch[] {
  return branches.map((branch, branchIndex) => {
    const row = clamp(Math.floor(branch.row ?? defaultBranchRow(branchIndex, branches.length, rows)), 0, rows - 1)

    return {
      ...branch,
      row,
      nodes: branch.nodes.map((node, nodeIndex) => ({
        ...node,
        col: clamp(Math.floor(node.col ?? nodeIndex + 1), 1, cols - 2),
        row: clamp(Math.floor(node.row ?? row), 0, rows - 1),
      })),
    }
  })
}

function defaultBranchRow(branchIndex: number, branchCount: number, rows: number): number {
  if (branchCount <= 1) {
    return Math.floor(rows / 2)
  }

  if (rows >= branchCount * 2 + 1) {
    return 1 + branchIndex * 2
  }

  return Math.round(((branchIndex + 1) * (rows - 1)) / (branchCount + 1))
}

function buildSidechainPath(
  link: TraceSidechainLink,
  index: number,
  branches: ResolvedTraceBranch[],
  cols: number,
  rows: number,
  gridPixels: TraceGridPixels,
): TraceSidechainPath {
  const from = resolveEndpoint(link.from, branches, cols, rows, gridPixels)
  const to = resolveEndpoint(link.to, branches, cols, rows, gridPixels)
  const midX = round((from.x + to.x) / 2)

  return {
    id: link.id ?? `sidechain-${index}`,
    from,
    to,
    d: linePath([from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]),
  }
}

function resolveEndpoint(
  endpoint: TraceEndpoint,
  branches: ResolvedTraceBranch[],
  cols: number,
  rows: number,
  gridPixels: TraceGridPixels,
): TracePoint {
  const branch =
    branches.find((candidate) => endpoint.branchId && candidate.id === endpoint.branchId) ??
    branches[endpoint.branchIndex ?? 0] ??
    branches[0]

  const node =
    branch?.nodes.find((candidate) => endpoint.nodeId && candidate.id === endpoint.nodeId) ??
    branch?.nodes[endpoint.nodeIndex ?? 0]

  const col = clamp(Math.floor(endpoint.col ?? node?.col ?? 0), 0, cols - 1)
  const row = clamp(Math.floor(endpoint.row ?? node?.row ?? branch?.row ?? Math.floor(rows / 2)), 0, rows - 1)
  return pointForCell(col, row, cols, rows, gridPixels)
}

function pointForCell(col: number, row: number, cols: number, rows: number, gridPixels: TraceGridPixels): TracePoint {
  const paddingX = gridPixels.paddingX ?? 0
  const paddingY = gridPixels.paddingY ?? 0
  const usableWidth = Math.max(0, gridPixels.width - paddingX * 2)
  const usableHeight = Math.max(0, gridPixels.height - paddingY * 2)
  const xStep = cols > 1 ? usableWidth / (cols - 1) : 0
  const yStep = rows > 1 ? usableHeight / (rows - 1) : 0

  return {
    x: round(paddingX + xStep * col),
    y: round(paddingY + yStep * row),
  }
}

function orthogonalPath(points: TracePoint[]): string {
  const collapsed = collapseDuplicatePoints(points)
  if (collapsed.length <= 2) {
    return linePath(collapsed)
  }

  const [first, ...rest] = collapsed
  const commands = [`M ${formatPoint(first)}`]
  let cursor = first

  for (const point of rest) {
    if (point.x !== cursor.x) {
      commands.push(`H ${fmt(point.x)}`)
    }
    if (point.y !== cursor.y) {
      commands.push(`V ${fmt(point.y)}`)
    }
    cursor = point
  }

  return commands.join(' ')
}

function linePath(points: TracePoint[]): string {
  const collapsed = collapseDuplicatePoints(points)
  if (collapsed.length === 0) {
    return ''
  }

  const [first, ...rest] = collapsed
  return [`M ${formatPoint(first)}`, ...rest.map((point) => `L ${formatPoint(point)}`)].join(' ')
}

function bypassOutlinePath(center: TracePoint, gridPixels: TraceGridPixels): string {
  const radius = Math.max(8, Math.min(gridPixels.width, gridPixels.height) * 0.025)
  const x0 = round(center.x - radius)
  const x1 = round(center.x + radius)
  const y0 = round(center.y - radius)
  const y1 = round(center.y + radius)

  return `M ${fmt(x0)} ${fmt(y0)} H ${fmt(x1)} V ${fmt(y1)} H ${fmt(x0)} Z`
}

function collapseDuplicatePoints(points: TracePoint[]): TracePoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
}

function formatPoint(point: TracePoint): string {
  return `${fmt(point.x)} ${fmt(point.y)}`
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
