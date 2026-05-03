import type { StageNotificationConfig } from '../components/Toasts'
import type { PlatformAlert, PlatformLayerId, PlatformSeverity } from '../platform/model'
import type { PlatformEvent, PlatformEventSeverity } from '../../map2/platformEvent'

export type RouterTarget =
  | 'toast'
  | 'stage_kyron'
  | 'node_alert'
  | 'device_banner'
  | 'lcd_feed'
  | 'browser_notification'
  | 'audio_beep'

interface RouterDecisionBase {
  target: RouterTarget
  eventId: string
}

export interface ToastRouterDecision extends RouterDecisionBase {
  target: 'toast'
  tone: 'info' | 'warn' | 'error'
  title: string
  message: string
  persistent: boolean
  stage: StageNotificationConfig
}

export interface StageKyronRouterDecision extends RouterDecisionBase {
  target: 'stage_kyron'
  stage: StageNotificationConfig
}

export interface NodeAlertRouterDecision extends RouterDecisionBase {
  target: 'node_alert'
  alert: PlatformAlert
  nodeId: string
}

export interface DeviceBannerRouterDecision extends RouterDecisionBase {
  target: 'device_banner'
  title: string
  message: string
}

export interface LCDFeedRouterDecision extends RouterDecisionBase {
  target: 'lcd_feed'
  payload: PlatformEvent
}

export interface BrowserNotificationRouterDecision extends RouterDecisionBase {
  target: 'browser_notification'
  title: string
  message: string
  requireInteraction: boolean
}

export interface AudioBeepRouterDecision extends RouterDecisionBase {
  target: 'audio_beep'
  severity: PlatformEventSeverity
}

export type RouterDecision =
  | ToastRouterDecision
  | StageKyronRouterDecision
  | NodeAlertRouterDecision
  | DeviceBannerRouterDecision
  | LCDFeedRouterDecision
  | BrowserNotificationRouterDecision
  | AudioBeepRouterDecision

function eventTargetsSurface(event: PlatformEvent, surface: string): boolean {
  return event.target_surfaces.length === 0 || event.target_surfaces.includes(surface as never)
}

function severityToTone(severity: PlatformEventSeverity): 'info' | 'warn' | 'error' {
  if (severity === 'critical' || severity === 'error') {
    return 'error'
  }
  if (severity === 'warning') {
    return 'warn'
  }
  return 'info'
}

function severityToStageSeverity(severity: PlatformEventSeverity): StageNotificationConfig['severity'] {
  if (severity === 'critical' || severity === 'error') {
    return 'critical'
  }
  if (severity === 'warning') {
    return 'warning'
  }
  return 'info'
}

function severityToPlatformSeverity(severity: PlatformEventSeverity): PlatformSeverity {
  if (severity === 'critical') return 'critical'
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function classifyStageKind(event: PlatformEvent): NonNullable<StageNotificationConfig['kind']> {
  if (event.kind === 'snapshot.live.pinned') {
    return 'live_snapshot'
  }
  if (event.kind.startsWith('workflow.') || event.kind.startsWith('snapshot.')) {
    return 'workflow'
  }
  if (event.severity === 'critical' || event.severity === 'error') {
    return 'critical_alert'
  }
  if (event.severity === 'warning') {
    return 'warning_alert'
  }
  return 'workflow'
}

function mapEventToLayerId(event: PlatformEvent): PlatformLayerId {
  if (event.kind.startsWith('node.') || event.kind.startsWith('cluster.') || event.kind.startsWith('failover.')) {
    return 'cluster-dashboard'
  }
  if (event.kind.startsWith('avb.') || event.kind.startsWith('device.avb.')) {
    // AVB Routing was promoted out of the platform layer set into its
    // own /avb/* shell (nav reorg 2026-05-03). Surface AVB events on
    // the platform overview row so operators still get the alert; deep
    // links into the AVB shell live in the alert payload.
    return 'overview'
  }
  if (event.kind.startsWith('midi.') || event.kind.includes('midihub')) {
    return 'network-discovery'
  }
  if (event.kind.startsWith('config.') || event.kind.startsWith('maintenance.')) {
    return 'management'
  }
  return 'overview'
}

function buildStageConfig(event: PlatformEvent): StageNotificationConfig {
  return {
    kind: classifyStageKind(event),
    severity: severityToStageSeverity(event.severity),
    resource: event.resource
      ? {
          kind: String(event.resource.kind || 'generic') as StageNotificationConfig['resource']['kind'],
          id: String(event.resource.id || event.event_id),
        }
      : {
          kind: 'generic',
          id: event.event_id,
        },
    compactLabel: event.title,
    sourceLabel: event.source_node,
    liveSnapshotPinned: event.kind === 'snapshot.live.pinned',
    replaceLiveBanner: event.kind !== 'snapshot.live.pinned',
    sticky: event.sticky || event.ack_required,
    suppressTransient: event.kind !== 'snapshot.live.pinned',
    meta: [
      event.kind,
      event.source_service,
      event.correlation_id ?? '',
    ].filter(Boolean),
  }
}

function wantsStageKyron(event: PlatformEvent): boolean {
  return event.kind.startsWith('workflow.')
    || event.kind.startsWith('snapshot.')
    || event.severity === 'warning'
    || event.severity === 'error'
    || event.severity === 'critical'
}

function wantsBrowserNotification(event: PlatformEvent): boolean {
  return event.ack_required || event.sticky || event.severity === 'critical'
}

function wantsAudioBeep(event: PlatformEvent): boolean {
  return event.sound === true || event.severity === 'critical' || event.severity === 'error'
}

export function routePlatformEvent(event: PlatformEvent): RouterDecision[] {
  const decisions: RouterDecision[] = []

  if (eventTargetsSurface(event, 'web')) {
    decisions.push({
      target: 'toast',
      eventId: event.event_id,
      tone: severityToTone(event.severity),
      title: event.title,
      message: event.message,
      persistent: event.sticky || event.ack_required,
      stage: buildStageConfig(event),
    })

    if (wantsStageKyron(event)) {
      decisions.push({
        target: 'stage_kyron',
        eventId: event.event_id,
        stage: buildStageConfig(event),
      })
    }

    if (event.kind.startsWith('node.') || event.kind.startsWith('cluster.') || event.kind.startsWith('system.')) {
      decisions.push({
        target: 'node_alert',
        eventId: event.event_id,
        nodeId: event.source_node,
        alert: {
          id: event.event_id,
          layerId: mapEventToLayerId(event),
          severity: severityToPlatformSeverity(event.severity),
          title: event.title,
          subtitle: event.message,
        },
      })
    }

    if (event.kind.startsWith('device.') || event.kind.startsWith('effects_loop.')) {
      decisions.push({
        target: 'device_banner',
        eventId: event.event_id,
        title: event.title,
        message: event.message,
      })
    }

    if (wantsBrowserNotification(event)) {
      decisions.push({
        target: 'browser_notification',
        eventId: event.event_id,
        title: event.title,
        message: event.message,
        requireInteraction: event.ack_required || event.severity === 'critical',
      })
    }

    if (wantsAudioBeep(event)) {
      decisions.push({
        target: 'audio_beep',
        eventId: event.event_id,
        severity: event.severity,
      })
    }
  }

  if (eventTargetsSurface(event, 'lcd') || event.kind.startsWith('lcd.')) {
    decisions.push({
      target: 'lcd_feed',
      eventId: event.event_id,
      payload: event,
    })
  }

  return decisions
}

