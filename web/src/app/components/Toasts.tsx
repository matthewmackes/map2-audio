import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, Close, WarningAltFilled, WarningFilled } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ToastContainer, toast, type ToastOptions } from 'react-toastify'

import { useClusterSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import type { SnapshotRuntimeLiveState } from '../../map2/types'
import { withNodeQuery } from '../utils/clusterTransport'
import './Toasts.css'
import 'react-toastify/dist/ReactToastify.css'

export type NotificationTone = 'info' | 'success' | 'warn' | 'error'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'
export type NotificationClass =
  | 'critical_alert'
  | 'warning_alert'
  | 'live_snapshot'
  | 'workflow'
  | 'minor_transient'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationResourceKey {
  kind: 'snapshot' | 'node' | 'device' | 'backend' | 'workflow' | 'generic'
  id: string
}

export interface StageNotificationConfig {
  kind?: NotificationClass
  severity?: NotificationSeverity
  resource?: NotificationResourceKey
  compactLabel?: string
  sourceLabel?: string
  route?: string
  routeLabel?: string
  liveSnapshotPinned?: boolean
  replaceLiveBanner?: boolean
  sticky?: boolean
  suppressTransient?: boolean
  meta?: string[]
}

export interface NotificationOptions {
  id?: string
  persistent?: boolean
  durationMs?: number
  action?: NotificationAction
  title?: string
  stage?: StageNotificationConfig
}

interface NotificationRecord {
  id: string
  title: string
  message: string
  tone: NotificationTone
  timestamp: number
  updatedAt: number
  persistent: boolean
  action?: NotificationAction
  stage?: Required<StageNotificationConfig> | null
}

interface NotificationContextValue {
  pushNotification: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
  dismissNotification: (id: string) => void
  clearNotifications: () => void
  notifications: NotificationRecord[]
}

const TAKEOVER_DURATION_MS = 4200
const DEFAULT_STAGE_DURATION_MS = 6500
const ROOT_STAGE_NOTIFICATION_HEIGHT_VAR = '--stage-notification-reserved-height'

function makeNotificationId() {
  return crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
}

function severityFromTone(tone: NotificationTone): NotificationSeverity {
  switch (tone) {
    case 'error':
      return 'critical'
    case 'warn':
      return 'warning'
    case 'success':
      return 'success'
    default:
      return 'info'
  }
}

function titleFromTone(tone: NotificationTone): string {
  switch (tone) {
    case 'error':
      return 'Critical alert'
    case 'warn':
      return 'Warning'
    case 'success':
      return 'Update'
    default:
      return 'Info'
  }
}

function defaultKindForSeverity(severity: NotificationSeverity): NotificationClass {
  if (severity === 'critical') {
    return 'critical_alert'
  }
  if (severity === 'warning') {
    return 'warning_alert'
  }
  return 'workflow'
}

function normalizeStageConfig(
  tone: NotificationTone,
  options: NotificationOptions | undefined,
): Required<StageNotificationConfig> | null {
  if (!options?.stage) {
    return null
  }

  const severity = options.stage.severity ?? severityFromTone(tone)
  const kind = options.stage.kind ?? defaultKindForSeverity(severity)

  return {
    kind,
    severity,
    resource: options.stage.resource ?? { kind: 'generic', id: options.id ?? makeNotificationId() },
    compactLabel: options.stage.compactLabel ?? options.title ?? titleFromTone(tone),
    sourceLabel: options.stage.sourceLabel ?? '',
    route: options.stage.route ?? '',
    routeLabel: options.stage.routeLabel ?? 'Open related workspace',
    liveSnapshotPinned: Boolean(options.stage.liveSnapshotPinned),
    replaceLiveBanner: options.stage.replaceLiveBanner ?? kind !== 'live_snapshot',
    sticky: Boolean(options.stage.sticky),
    suppressTransient: options.stage.suppressTransient ?? true,
    meta: options.stage.meta ?? [],
  }
}

function shouldRenderTransient(stage: Required<StageNotificationConfig> | null): boolean {
  return !stage || !stage.suppressTransient
}

function buildToastifyOptions(
  id: string,
  tone: NotificationTone,
  options: NotificationOptions | undefined,
): ToastOptions {
  const type =
    tone === 'error'
      ? 'error'
      : tone === 'warn'
        ? 'warning'
        : tone === 'success'
          ? 'success'
          : 'info'

  return {
    toastId: id,
    type,
    autoClose: options?.persistent ? false : options?.durationMs ?? 4000,
    closeOnClick: !options?.action,
    draggable: false,
    pauseOnHover: true,
  }
}

function stagePriority(record: NotificationRecord): number {
  const stage = record.stage
  if (!stage) return 0
  if (stage.kind === 'critical_alert') return 500
  if (stage.severity === 'critical') return 460
  if (stage.kind === 'warning_alert') return 420
  if (stage.severity === 'warning') return 390
  if (stage.kind === 'live_snapshot') return 320
  if (stage.kind === 'workflow') return 240
  return 100
}

function isTakeoverCandidate(record: NotificationRecord | null): boolean {
  if (!record?.stage) {
    return false
  }

  return (
    (record.stage.kind === 'critical_alert' || record.stage.kind === 'warning_alert' || record.stage.severity === 'critical')
    && Date.now() - record.timestamp < TAKEOVER_DURATION_MS
  )
}

function chooseLiveSnapshot(states: SnapshotRuntimeLiveState[]): SnapshotRuntimeLiveState | null {
  const liveStates = states.filter((state) => !state.is_offline && state.state === 'live' && state.snapshot_id != null)
  if (liveStates.length === 0) {
    return null
  }

  return liveStates.slice().sort((left, right) => {
    if (left.node_id === 'local') return -1
    if (right.node_id === 'local') return 1
    return (right.seq ?? 0) - (left.seq ?? 0)
  })[0] ?? null
}

function buildLiveSnapshotRecord(state: SnapshotRuntimeLiveState): NotificationRecord {
  return {
    id: `live-snapshot:${state.node_id}:${state.snapshot_id ?? 'none'}`,
    title: state.snapshot_name ?? (state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'Live snapshot'),
    message: state.display_label || 'Live',
    tone: state.is_warning ? 'warn' : 'success',
    timestamp: Date.now(),
    updatedAt: Date.now(),
    persistent: true,
    stage: {
      kind: 'live_snapshot',
      severity: state.is_warning ? 'warning' : 'success',
      resource: {
        kind: 'snapshot',
        id: String(state.snapshot_id ?? state.node_id),
      },
      compactLabel: state.snapshot_name ?? 'Live snapshot',
      sourceLabel: state.node_id,
      route: withNodeQuery('/snapshot-editor', state.node_id),
      routeLabel: `Open ${state.snapshot_name ?? 'live snapshot'} in Snapshot Editor`,
      liveSnapshotPinned: true,
      replaceLiveBanner: false,
      sticky: true,
      suppressTransient: true,
      meta: [
        state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'Live snapshot',
        state.snapshot_revision ? `Revision ${state.snapshot_revision}` : '',
        state.node_id,
      ].filter(Boolean),
    },
  }
}

function NotificationActionButton({ action }: { action: NotificationAction }) {
  return (
    <Button kind="ghost" size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}

const noopContextValue: NotificationContextValue = {
  pushNotification: () => '',
  dismissNotification: () => {},
  clearNotifications: () => {},
  notifications: [],
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    toast.dismiss(id)
  }, [])

  const pushNotification = useCallback((message: string, tone: NotificationTone = 'info', options: NotificationOptions = {}) => {
    const id = options.id ?? makeNotificationId()
    const title = options.title ?? titleFromTone(tone)
    const stage = normalizeStageConfig(tone, {
      ...options,
      id,
    })
    const timestamp = Date.now()
    const persistent = Boolean(options.persistent || stage?.sticky)

    setNotifications((prev) => {
      const existing = prev.find((notification) => notification.id === id)
      const nextRecord: NotificationRecord = {
        id,
        title,
        message,
        tone,
        timestamp: existing?.timestamp ?? timestamp,
        updatedAt: timestamp,
        persistent,
        action: options.action,
        stage,
      }
      return [...prev.filter((notification) => notification.id !== id), nextRecord]
    })

    const existingTimer = timersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(id)
    }

    if (!persistent) {
      const timer = setTimeout(() => dismissNotification(id), options.durationMs ?? (stage ? DEFAULT_STAGE_DURATION_MS : 5000))
      timersRef.current.set(id, timer)
    }

    if (shouldRenderTransient(stage)) {
      const content = (
        <div className="stage-notification-transient__body">
          <strong>{title}</strong>
          <span>{message}</span>
          {options.action ? <button type="button" onClick={options.action.onClick}>{options.action.label}</button> : null}
        </div>
      )
      if (toast.isActive(id)) {
        toast.update(id, {
          render: content,
          ...buildToastifyOptions(id, tone, options),
        })
      } else {
        toast(content, buildToastifyOptions(id, tone, options))
      }
    } else {
      toast.dismiss(id)
    }

    return id
  }, [dismissNotification])

  const clearNotifications = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
    setNotifications([])
    toast.dismiss()
  }, [])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  const value = useMemo<NotificationContextValue>(() => ({
    pushNotification,
    dismissNotification,
    clearNotifications,
    notifications,
  }), [pushNotification, dismissNotification, clearNotifications, notifications])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <StageNotificationViewport />
      <ToastContainer
        position="top-right"
        newestOnTop
        closeButton={false}
        hideProgressBar
        theme="colored"
        className="stage-notification-transient-container"
        toastClassName="stage-notification-transient"
        bodyClassName="stage-notification-transient__wrap"
      />
    </NotificationContext.Provider>
  )
}

function StageNotificationViewport() {
  const { notifications, dismissNotification } = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const [liveSnapshotCollapsed, setLiveSnapshotCollapsed] = useState(false)
  const clusterLiveStateQuery = useClusterSnapshotRuntimeLiveState({
    enabled: !location.pathname.startsWith('/snapshot-editor'),
    refetchInterval: 5_000,
  })

  const emittedStageNotifications = useMemo(
    () => notifications
      .filter((notification) => notification.stage)
      .sort((left, right) => {
        const priorityDelta = stagePriority(right) - stagePriority(left)
        if (priorityDelta !== 0) return priorityDelta
        return right.updatedAt - left.updatedAt
      }),
    [notifications],
  )

  const liveSnapshotRecord = useMemo(() => {
    if (location.pathname.startsWith('/snapshot-editor')) {
      return null
    }

    const candidate = chooseLiveSnapshot(clusterLiveStateQuery.data?.nodes ?? [])
    return candidate ? buildLiveSnapshotRecord(candidate) : null
  }, [clusterLiveStateQuery.data?.nodes, location.pathname])

  const primaryStageRecord = emittedStageNotifications[0] ?? null
  const primaryRecord = primaryStageRecord ?? liveSnapshotRecord
  const secondaryRecords = primaryStageRecord
    ? emittedStageNotifications.slice(1, 4)
    : []
  const railRecords = primaryStageRecord
    ? emittedStageNotifications.slice(0, 4)
    : liveSnapshotRecord
      ? [liveSnapshotRecord]
      : []
  const mode = primaryStageRecord
    ? (isTakeoverCandidate(primaryStageRecord) ? 'takeover' : 'expanded')
    : (liveSnapshotCollapsed && liveSnapshotRecord ? 'rail' : 'expanded')

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    if (!primaryRecord || mode === 'rail' || !bannerRef.current) {
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, '0px')
      return
    }

    const updateHeight = () => {
      const height = bannerRef.current?.offsetHeight ?? 0
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, `${height}px`)
    }

    updateHeight()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(bannerRef.current)
    return () => {
      resizeObserver.disconnect()
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, '0px')
    }
  }, [mode, primaryRecord])

  if (!primaryRecord) {
    return null
  }

  const toneClass = primaryRecord.stage?.severity ?? severityFromTone(primaryRecord.tone)
  const headline = primaryRecord.title
  const body = primaryRecord.message
  const meta = primaryRecord.stage?.meta?.filter((item) => item.trim().length > 0) ?? []
  const showDismiss = Boolean(primaryStageRecord && !primaryRecord.stage?.liveSnapshotPinned)
  const showCollapse = !primaryStageRecord && Boolean(liveSnapshotRecord)

  if (mode === 'rail') {
    return (
      <aside className="stage-notification-rail" aria-label="Notification rail">
        {railRecords.map((record) => (
          <button
            key={record.id}
            type="button"
            className={`stage-notification-rail__item stage-notification-rail__item--${record.stage?.severity ?? severityFromTone(record.tone)}`}
            onClick={() => setLiveSnapshotCollapsed(false)}
          >
            <span className="stage-notification-rail__label">{record.stage?.compactLabel ?? record.title}</span>
            <span className="stage-notification-rail__message">{record.message}</span>
          </button>
        ))}
      </aside>
    )
  }

  return (
    <div
      ref={bannerRef}
      className={`stage-notification-surface stage-notification-surface--${mode} stage-notification-surface--${toneClass}`}
      role={toneClass === 'critical' || toneClass === 'warning' ? 'alert' : 'status'}
      aria-live={toneClass === 'critical' ? 'assertive' : 'polite'}
    >
      <section className="stage-notification-surface__primary">
        <div className="stage-notification-surface__signal" aria-hidden="true">
          {toneClass === 'critical' ? <WarningFilled size={28} /> : toneClass === 'warning' ? <WarningAltFilled size={28} /> : null}
        </div>
        <div className="stage-notification-surface__content">
          <div className="stage-notification-surface__eyebrow">
            {primaryRecord.stage?.kind === 'live_snapshot' ? 'Live snapshot' : primaryRecord.title}
          </div>
          <h2>{headline}</h2>
          <p>{body}</p>
          {meta.length > 0 ? (
            <div className="stage-notification-surface__meta">
              {meta.map((item) => (
                <span key={`${primaryRecord.id}:${item}`}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="stage-notification-surface__actions">
          {primaryRecord.stage?.route ? (
            <button
              type="button"
              className="stage-notification-surface__icon-button"
              aria-label={primaryRecord.stage.routeLabel}
              onClick={() => navigate(primaryRecord.stage!.route)}
            >
              <ArrowRight size={20} />
            </button>
          ) : null}
          {primaryRecord.action ? <NotificationActionButton action={primaryRecord.action} /> : null}
          {showCollapse ? (
            <button
              type="button"
              className="stage-notification-surface__icon-button"
              aria-label="Hide live snapshot banner"
              onClick={() => setLiveSnapshotCollapsed(true)}
            >
              <ChevronDown size={20} />
            </button>
          ) : null}
          {showDismiss ? (
            <button
              type="button"
              className="stage-notification-surface__icon-button"
              aria-label={`Dismiss ${headline}`}
              onClick={() => dismissNotification(primaryRecord.id)}
            >
              <Close size={20} />
            </button>
          ) : null}
          {!showCollapse && liveSnapshotCollapsed && liveSnapshotRecord ? (
            <button
              type="button"
              className="stage-notification-surface__icon-button"
              aria-label="Expand notification banner"
              onClick={() => setLiveSnapshotCollapsed(false)}
            >
              <ChevronUp size={20} />
            </button>
          ) : null}
        </div>
      </section>
      {secondaryRecords.length > 0 ? (
        <div className="stage-notification-surface__secondary" aria-label="Related notifications">
          {secondaryRecords.map((record) => (
            <button
              key={record.id}
              type="button"
              className={`stage-notification-secondary-chip stage-notification-secondary-chip--${record.stage?.severity ?? severityFromTone(record.tone)}`}
              onClick={() => {
                if (record.stage?.route) {
                  navigate(record.stage.route)
                }
              }}
            >
              <span>{record.stage?.compactLabel ?? record.title}</span>
              <small>{record.message}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function useNotifications() {
  return useContext(NotificationContext) ?? noopContextValue
}

export function useToasts() {
  const { pushNotification: pushToast, dismissNotification: dismissToast } = useNotifications()
  return { pushToast, dismissToast }
}

export { NotificationProvider as ToastProvider }
