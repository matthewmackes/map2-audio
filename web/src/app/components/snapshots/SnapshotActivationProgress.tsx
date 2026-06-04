// T2534: realtime activation progress panel.
//
// Renders the live, ordered step list streamed from the backend during a
// snapshot create/activate (over the snapshot_activation_events WS topic). Each
// step shows its status and, when the subsystem it touches is still starting up
// after a reboot, a "Warming up <subsystem>" tag — so the operator sees exactly
// what is happening during the long fresh-reboot activation instead of a frozen
// "Creating…" button.

import { InlineLoading, Layer, Tag } from '@carbon/react'

import { useSnapshotActivationProgress } from '../../hooks/useSnapshotRuntimeState'
import type { SnapshotActivationStepEvent } from '../../../map2/types'

// Human-readable labels for the instrumented activation steps.
const STEP_LABELS: Record<string, string> = {
  preflight: 'Preflight checks',
  topology_probe: 'Reading engine topology',
  pipewire_quantum: 'Locking audio clock',
  audio_device_bindings: 'Binding audio devices',
  monitoring_output: 'Setting monitoring output',
  sonobus_io: 'SonoBus I/O',
  output_safety: 'Output safety limits',
  runtime_chains: 'Building runtime chains',
  engine_graph_apply: 'Loading plugins into engine',
  topology_settle: 'Settling engine topology',
  authority_confirm: 'Confirming authoritative state',
  still_activating: 'Still activating',
}

const SUBSYSTEM_LABELS: Record<string, string> = {
  engine: 'audio engine',
  pipewire: 'PipeWire',
  etcd: 'state authority',
  sonobus: 'SonoBus',
  database: 'database',
}

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step.replace(/_/g, ' ')
}

function subsystemLabel(subsystem: string | null): string {
  if (!subsystem) {
    return 'subsystem'
  }
  return SUBSYSTEM_LABELS[subsystem] ?? subsystem
}

function formatElapsed(elapsedMs: number | null): string | null {
  if (elapsedMs == null) {
    return null
  }
  if (elapsedMs >= 1000) {
    return `${(elapsedMs / 1000).toFixed(1)}s`
  }
  return `${Math.round(elapsedMs)}ms`
}

function StepRow({ event }: { event: SnapshotActivationStepEvent }) {
  const elapsed = formatElapsed(event.elapsed_ms)
  const isRunning = event.status === 'started' || event.status === 'warming'
  const isWarming = event.warming && event.status !== 'completed'

  return (
    <li
      className="snapshot-activation-progress__step"
      data-step={event.step}
      data-status={event.status}
    >
      <span className="snapshot-activation-progress__step-indicator">
        {event.status === 'completed' ? (
          <Tag type="green" size="sm">Done</Tag>
        ) : event.status === 'failed' ? (
          <Tag type="red" size="sm">Failed</Tag>
        ) : isWarming ? (
          <InlineLoading
            status="active"
            description={`Warming up ${subsystemLabel(event.warming_subsystem || event.subsystem)}…`}
          />
        ) : isRunning ? (
          <InlineLoading status="active" description="Working…" />
        ) : (
          <Tag type="cool-gray" size="sm">Pending</Tag>
        )}
      </span>
      <span className="snapshot-activation-progress__step-label">{stepLabel(event.step)}</span>
      <span className="snapshot-activation-progress__step-meta">
        {isWarming && (
          <Tag type="warm-gray" size="sm">
            Warming up {subsystemLabel(event.warming_subsystem || event.subsystem)}
          </Tag>
        )}
        {elapsed && event.status === 'completed' && (
          <span className="snapshot-activation-progress__step-elapsed">{elapsed}</span>
        )}
      </span>
    </li>
  )
}

export interface SnapshotActivationProgressProps {
  /** True while the create/activate mutation is in flight (shows the panel
   * immediately, before the first backend step arrives). */
  active?: boolean
}

export function SnapshotActivationProgress({ active = false }: SnapshotActivationProgressProps) {
  const progress = useSnapshotActivationProgress()
  const visible = active || progress.isActivating

  if (!visible) {
    return null
  }

  const heading = progress.failed
    ? 'Activation failed'
    : progress.warming
      ? `Activating — warming up ${progress.warmingSubsystems.map(subsystemLabel).join(', ')}`
      : 'Activating snapshot'

  return (
    <Layer
      className="snapshot-activation-progress"
      id="snapshot-activation-progress"
      aria-live="polite"
    >
      <div className="snapshot-activation-progress__header">
        <span className="snapshot-activation-progress__title">{heading}</span>
        {progress.warming && (
          <Tag type="warm-gray" size="sm">Engine warming up after reboot</Tag>
        )}
      </div>
      {progress.steps.length === 0 ? (
        <InlineLoading status="active" description="Starting activation…" />
      ) : (
        <ol className="snapshot-activation-progress__steps">
          {progress.steps.map((event) => (
            <StepRow key={`${event.request_id}:${event.step}`} event={event} />
          ))}
        </ol>
      )}
    </Layer>
  )
}

export default SnapshotActivationProgress
