type UnknownRecord = Record<string, unknown>

const RANGE_TO_MS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export type ClusterNodeStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED'

export interface NormalizedClusterNode {
  nodeId: string
  hostname: string
  role: string
  status: ClusterNodeStatus
  healthScore: number
  cpuCores: number
  totalMemoryGb: number
  raw: UnknownRecord
}

export interface ClusterMetricSample {
  nodeId: string
  timestampMs: number
  isoTimestamp: string
  cpuPercent: number
  memoryPercent: number
  dspLoadPercent: number
  xrunCount: number
  latencyMs: number
}

export interface ClusterMetricsSummary {
  avgCpuPercent: number
  avgMemoryPercent: number
  avgDspLoadPercent: number
  maxLatencyMs: number
  totalXruns: number
  sampleCount: number
}

export interface ClusterMetricsPoint {
  timestampMs: number
  timeLabel: string
  cpu: number
  memory: number
  dsp: number
  latency: number
  samples: number
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as UnknownRecord
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseMetadata(value: unknown): UnknownRecord {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return asRecord(parsed) ?? {}
    } catch {
      return {}
    }
  }
  return asRecord(value) ?? {}
}

function normalizeStatus(value: unknown): ClusterNodeStatus {
  const status = String(value ?? '').trim().toUpperCase()
  if (status === 'ONLINE' || status === 'HEALTHY') {
    return 'ONLINE'
  }
  if (status === 'OFFLINE' || status === 'FAILED') {
    return 'OFFLINE'
  }
  return 'DEGRADED'
}

function parseTimestamp(value: unknown): { timestampMs: number; isoTimestamp: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestampMs = value > 1_000_000_000_000 ? value : value * 1000
    return { timestampMs, isoTimestamp: new Date(timestampMs).toISOString() }
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return { timestampMs: parsed, isoTimestamp: new Date(parsed).toISOString() }
    }
  }

  const now = Date.now()
  return { timestampMs: now, isoTimestamp: new Date(now).toISOString() }
}

function resolveNodeId(record: UnknownRecord, index: number): string {
  const rawId = record.node_id ?? record.id ?? record.hostname
  if (typeof rawId === 'string' && rawId.trim()) {
    return rawId
  }
  return `node-${index + 1}`
}

function resolveRole(record: UnknownRecord): string {
  const rawRole = record.role ?? record.deployment_mode ?? 'UNKNOWN'
  return String(rawRole || 'UNKNOWN').toUpperCase()
}

function resolveHostname(record: UnknownRecord, nodeId: string): string {
  const hostname = record.hostname
  if (typeof hostname === 'string' && hostname.trim()) {
    return hostname
  }
  return nodeId
}

function resolveNodeArray(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(node => asRecord(node) ?? {})
  }

  const record = asRecord(payload)
  if (!record) {
    return []
  }

  if (Array.isArray(record.nodes)) {
    return record.nodes.map(node => asRecord(node) ?? {})
  }

  const allNodes = asRecord(record.all_nodes)
  if (allNodes) {
    return Object.entries(allNodes).map(([id, value]) => {
      const node = asRecord(value) ?? {}
      return { ...node, id }
    })
  }

  return []
}

function resolveMetricArray(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(sample => asRecord(sample) ?? {})
  }

  const record = asRecord(payload)
  if (record && Array.isArray(record.metrics)) {
    return record.metrics.map(sample => asRecord(sample) ?? {})
  }

  return []
}

export function normalizeClusterNodes(payload: unknown): NormalizedClusterNode[] {
  return resolveNodeArray(payload).map((raw, index) => {
    const nodeId = resolveNodeId(raw, index)
    const metadata = parseMetadata(raw.metadata)

    return {
      nodeId,
      hostname: resolveHostname(raw, nodeId),
      role: resolveRole(raw),
      status: normalizeStatus(raw.status),
      healthScore: toNumber(raw.health_score, 0),
      cpuCores: toNumber(raw.cpu_cores, toNumber(metadata.cpu_cores, 0)),
      totalMemoryGb: toNumber(raw.total_memory_gb, toNumber(metadata.total_memory_gb, 0)),
      raw,
    }
  })
}

export function normalizeClusterMetrics(payload: unknown): ClusterMetricSample[] {
  return resolveMetricArray(payload).map((raw, index) => {
    const { timestampMs, isoTimestamp } = parseTimestamp(raw.timestamp)
    const rawNodeId = raw.node_id ?? raw.id ?? raw.hostname
    const nodeId =
      typeof rawNodeId === 'string' && rawNodeId.trim()
        ? rawNodeId
        : `sample-${index + 1}`

    return {
      nodeId,
      timestampMs,
      isoTimestamp,
      cpuPercent: toNumber(raw.cpu_percent, 0),
      memoryPercent: toNumber(raw.memory_percent, 0),
      dspLoadPercent: toNumber(raw.dsp_load_percent, 0),
      xrunCount: Math.max(0, Math.round(toNumber(raw.xrun_count, 0))),
      latencyMs: toNumber(raw.latency_ms, 0),
    }
  })
}

export function filterMetricsByRange(samples: ClusterMetricSample[], range: string): ClusterMetricSample[] {
  const rangeMs = RANGE_TO_MS[range] ?? RANGE_TO_MS['24h']
  const cutoff = Date.now() - rangeMs
  return samples.filter(sample => sample.timestampMs >= cutoff)
}

export function summarizeClusterMetrics(payload: unknown, samples?: ClusterMetricSample[]): ClusterMetricsSummary {
  const normalizedSamples = samples ?? normalizeClusterMetrics(payload)
  const sampleCount = normalizedSamples.length
  const payloadRecord = asRecord(payload)

  const fallbackSummary = normalizedSamples.reduce(
    (acc, sample) => {
      acc.cpu += sample.cpuPercent
      acc.memory += sample.memoryPercent
      acc.dsp += sample.dspLoadPercent
      acc.maxLatency = Math.max(acc.maxLatency, sample.latencyMs)
      return acc
    },
    { cpu: 0, memory: 0, dsp: 0, maxLatency: 0 }
  )

  const latestByNode = new Map<string, ClusterMetricSample>()
  normalizedSamples.forEach(sample => {
    const current = latestByNode.get(sample.nodeId)
    if (!current || sample.timestampMs > current.timestampMs) {
      latestByNode.set(sample.nodeId, sample)
    }
  })

  const totalXruns = [...latestByNode.values()].reduce((sum, sample) => sum + sample.xrunCount, 0)

  const computed: ClusterMetricsSummary = {
    avgCpuPercent: sampleCount > 0 ? fallbackSummary.cpu / sampleCount : 0,
    avgMemoryPercent: sampleCount > 0 ? fallbackSummary.memory / sampleCount : 0,
    avgDspLoadPercent: sampleCount > 0 ? fallbackSummary.dsp / sampleCount : 0,
    maxLatencyMs: fallbackSummary.maxLatency,
    totalXruns,
    sampleCount,
  }

  return {
    avgCpuPercent: toNumber(payloadRecord?.avg_cpu_percent, computed.avgCpuPercent),
    avgMemoryPercent: toNumber(payloadRecord?.avg_memory_percent, computed.avgMemoryPercent),
    avgDspLoadPercent: toNumber(payloadRecord?.avg_dsp_load_percent, computed.avgDspLoadPercent),
    maxLatencyMs: toNumber(payloadRecord?.max_latency_ms, computed.maxLatencyMs),
    totalXruns: computed.totalXruns,
    sampleCount: computed.sampleCount,
  }
}

export function buildClusterMetricsSeries(
  samples: ClusterMetricSample[],
  maxPoints = 24
): ClusterMetricsPoint[] {
  if (samples.length === 0) {
    return []
  }

  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs)
  const durationMs = Math.max(0, sorted[sorted.length - 1].timestampMs - sorted[0].timestampMs)
  const bucketMs = Math.max(60_000, Math.ceil(durationMs / Math.max(1, maxPoints)))

  const buckets = new Map<number, { cpu: number; memory: number; dsp: number; latency: number; count: number }>()
  sorted.forEach(sample => {
    const bucket = Math.floor(sample.timestampMs / bucketMs) * bucketMs
    const current = buckets.get(bucket) ?? { cpu: 0, memory: 0, dsp: 0, latency: 0, count: 0 }
    current.cpu += sample.cpuPercent
    current.memory += sample.memoryPercent
    current.dsp += sample.dspLoadPercent
    current.latency = Math.max(current.latency, sample.latencyMs)
    current.count += 1
    buckets.set(bucket, current)
  })

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-maxPoints)
    .map(([timestampMs, point]) => {
      const date = new Date(timestampMs)
      return {
        timestampMs,
        timeLabel: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpu: point.count > 0 ? point.cpu / point.count : 0,
        memory: point.count > 0 ? point.memory / point.count : 0,
        dsp: point.count > 0 ? point.dsp / point.count : 0,
        latency: point.latency,
        samples: point.count,
      }
    })
}

export function getServiceStatusForNode(node: NormalizedClusterNode, runOn: string[]) {
  const allowedRoles = runOn.map(role => role.toUpperCase())
  const nodeRole = node.role.toUpperCase()
  const shouldRun =
    allowedRoles.includes('ALL') ||
    allowedRoles.includes(nodeRole) ||
    (nodeRole === 'STANDBY-MANAGEMENT' && allowedRoles.includes('MANAGEMENT-NODE'))

  if (!shouldRun) {
    return 'n/a' as const
  }
  if (node.status === 'ONLINE') {
    return 'running' as const
  }
  if (node.status === 'OFFLINE') {
    return 'offline' as const
  }
  return 'degraded' as const
}
