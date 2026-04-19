export const PLATFORM_EVENT_SEVERITIES = ['critical', 'error', 'warning', 'info'] as const
export type PlatformEventSeverity = (typeof PLATFORM_EVENT_SEVERITIES)[number]

export const PLATFORM_EVENT_FILTERED_SEVERITY = 'filtered' as const
export type PlatformEventFilteredSeverity = typeof PLATFORM_EVENT_FILTERED_SEVERITY

export const PLATFORM_EVENT_WEB_TONES = ['info', 'success', 'warn', 'warning', 'error', 'critical'] as const
export type PlatformEventWebTone = (typeof PLATFORM_EVENT_WEB_TONES)[number]

export const PLATFORM_EVENT_SURFACES = ['web', 'mk1', 'lcd', 'tui', 'push', 'mcu'] as const
export type PlatformEventSurface = (typeof PLATFORM_EVENT_SURFACES)[number]

export const PLATFORM_EVENT_FIELDS = [
  'event_id',
  'kind',
  'severity',
  'source_node',
  'source_service',
  'occurred_at',
  'monotonic_ns',
  'title',
  'message',
  'context',
  'correlation_id',
  'dedupe_key',
  'ttl_seconds',
  'expires_at',
  'priority',
  'icon',
  'color',
  'sound',
  'sticky',
  'resource',
  'broadcast',
  'target_nodes',
  'target_surfaces',
  'workflow',
  'supersedes',
  'ack_required',
] as const
export type PlatformEventField = (typeof PLATFORM_EVENT_FIELDS)[number]

export const PLATFORM_EVENT_KINDS = [
  'audio.xrun',
  'audio.engine.status',
  'audio.path.changed',
  'snapshot.activation.started',
  'snapshot.activation.ok',
  'snapshot.activation.failed',
  'snapshot.live.pinned',
  'snapshot.runtime.progress',
  'node.online',
  'node.offline',
  'node.degraded',
  'node.failover',
  'node.recovered',
  'device.mpx1.connected',
  'device.mpx1.disconnected',
  'device.intelfx.status',
  'device.midihub.peer.online',
  'device.midihub.peer.offline',
  'device.tesira.fleet.delta',
  'device.avb.stream.delta',
  'workflow.started',
  'workflow.progress',
  'workflow.completed',
  'workflow.cancelled',
  'system.cpu.high',
  'system.cpu.critical',
  'system.memory.high',
  'system.disk.high',
  'system.temp.high',
  'plugin.added',
  'plugin.removed',
  'plugin.bypassed',
  'plugin.parameter.changed',
  'plugin.preset.loaded',
  'plugin.output.clipping',
  'plugin.scan.progress',
  'midi.port.discovered',
  'midi.port.lost',
  'midi.node.discovered',
  'midi.node.lost',
  'midi.connection.requested',
  'midi.connection.established',
  'midi.connection.failed',
  'midi.connection.lost',
  'midi.clock.master.elected',
  'midi.clock.drift',
  'midi.profile.shared',
  'midi.failover.triggered',
  'midi.failover.completed',
  'ir.download.progress',
  'soundfont.download.progress',
  'api.openapi.out_of_sync',
  'api.observatory.anomaly',
  'config.changed',
  'config.updated',
  'config.sync.requested',
  'config.sync.completed',
  'config.pushed',
  'config.rolled_back',
  'config.synced',
  'cluster.federation.state',
  'cluster.update.started',
  'cluster.update.completed',
  'cluster.update.failed',
  'cluster.update.rolled_back',
  'failover.initiated',
  'failover.completed',
  'failover.failed',
  'maintenance.started',
  'maintenance.completed',
  'metrics.collected',
  'system.performance.alert',
  'system.status',
  'system.health.degraded',
  'system.health.recovered',
  'system.health.critical',
  'chain.created',
  'chain.deleted',
  'chain.renamed',
  'chain.activated',
  'chain.deactivated',
  'chain.morphed',
  'parameter.changed',
  'automation.started',
  'automation.stopped',
  'automation.time',
  'automation.lane.added',
  'automation.lane.deleted',
  'avb.endpoints.updated',
  'avb.connections.updated',
  'avb.connection.state.changed',
  'device.avb.stream.updated',
  'device.avb.ptp.updated',
  'device.avb.entities.updated',
  'effects_loop.state',
  'effects_loop.metrics',
  'effects_loop.calibration.progress',
  'lcd.audio',
  'lcd.system',
  'lcd.network',
  'lcd.service',
  'lcd.user',
  'lcd.alert',
] as const
export type PlatformEventKind = (typeof PLATFORM_EVENT_KINDS)[number]

export interface PlatformEventResource {
  kind: string
  id: string
  [key: string]: unknown
}

export interface PlatformEventWorkflow {
  stage?: string
  progress?: number
  can_cancel?: boolean
  cancel_path?: string
  [key: string]: unknown
}

export interface PlatformEvent {
  event_id: string
  kind: PlatformEventKind
  severity: PlatformEventSeverity
  source_node: string
  source_service: string
  occurred_at: string
  monotonic_ns: number | null
  title: string
  message: string
  context: Record<string, unknown>
  correlation_id: string | null
  dedupe_key: string | null
  ttl_seconds: number
  expires_at: string | null
  priority: number
  icon: string | null
  color: string | null
  sound: boolean | null
  sticky: boolean
  resource: PlatformEventResource | null
  broadcast: boolean
  target_nodes: string[]
  target_surfaces: PlatformEventSurface[]
  workflow: PlatformEventWorkflow | null
  supersedes: string | null
  ack_required: boolean
}
