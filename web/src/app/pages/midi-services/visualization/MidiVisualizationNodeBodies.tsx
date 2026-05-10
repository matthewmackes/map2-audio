/**
 * T2500-MV-D1 — Custom node bodies for the visualization.
 *
 * Three caller-owned components passed to <SignalFlowGraph nodeTypes>.
 * Per the T2477 reuse rule, none of these import ReactFlow directly;
 * they receive the standard `{data, ...}` ReactFlow node prop and
 * render Carbon-token chrome.
 *
 * Active-state styling is data-attribute driven so the canvas overlay
 * can pulse/heatmap them via class additions without re-rendering the
 * React component on every event.
 */

import type { NodeProps } from 'reactflow'

import type { MidiVisualizationNodeData } from './midiVisualizationLayout'
import './MidiVisualizationNodeBodies.css'

const ACTIVE_THRESHOLD_MS = 60_000

type Props = NodeProps<MidiVisualizationNodeData>

function activityState(data: MidiVisualizationNodeData): 'live' | 'idle' {
  if (data.lastEventAt === null) return 'idle'
  return Date.now() - data.lastEventAt < ACTIVE_THRESHOLD_MS ? 'live' : 'idle'
}

function rateLabel(rateHz: number): string {
  if (rateHz === 0) return '—'
  if (rateHz < 1) return `${rateHz.toFixed(2)}/s`
  if (rateHz < 100) return `${rateHz.toFixed(1)}/s`
  return `${Math.round(rateHz)}/s`
}

export function DeviceNodeBody({ data }: Props) {
  const state = activityState(data)
  const portId = (data.raw.port_id as string | undefined) ?? '—'
  return (
    <div
      className={`midi-viz-node midi-viz-node--device midi-viz-node--${state}`}
      data-state={state}
      role="group"
      aria-label={`MIDI device: ${data.label}`}
    >
      <header className="midi-viz-node__header">
        <span className="midi-viz-node__kind">Device</span>
        <span className={`midi-viz-node__pulse midi-viz-node__pulse--${state}`} aria-hidden />
      </header>
      <div className="midi-viz-node__title" title={data.label}>
        {data.label}
      </div>
      <div className="midi-viz-node__sub">{portId}</div>
      <footer className="midi-viz-node__footer">
        <span className="midi-viz-node__rate">{rateLabel(data.rateHz)}</span>
      </footer>
    </div>
  )
}

export function MappingNodeBody({ data }: Props) {
  const state = activityState(data)
  const packId = (data.raw.pack_id as string | undefined) ?? '—'
  const model = (data.raw.model as string | undefined) ?? '—'
  const controlCount =
    (data.raw.control_count as number | undefined) ?? undefined
  return (
    <div
      className={`midi-viz-node midi-viz-node--mapping midi-viz-node--${state}`}
      data-state={state}
      role="group"
      aria-label={`Mapping: ${data.label}`}
    >
      <header className="midi-viz-node__header">
        <span className="midi-viz-node__kind">Mapping</span>
        <span className={`midi-viz-node__pulse midi-viz-node__pulse--${state}`} aria-hidden />
      </header>
      <div className="midi-viz-node__title" title={data.label}>
        {packId}
      </div>
      <div className="midi-viz-node__sub">{model}</div>
      <footer className="midi-viz-node__footer">
        {typeof controlCount === 'number' ? (
          <span className="midi-viz-node__meta">
            {controlCount} control{controlCount === 1 ? '' : 's'}
          </span>
        ) : null}
        <span className="midi-viz-node__rate">{rateLabel(data.rateHz)}</span>
      </footer>
    </div>
  )
}

export function TargetNodeBody({ data }: Props) {
  const state = activityState(data)
  const isPattern = Boolean(data.raw.is_pattern)
  return (
    <div
      className={`midi-viz-node midi-viz-node--target midi-viz-node--${state}`}
      data-state={state}
      role="group"
      aria-label={`Engine target: ${data.label}`}
    >
      <header className="midi-viz-node__header">
        <span className="midi-viz-node__kind">{isPattern ? 'Pattern' : 'Target'}</span>
        <span className={`midi-viz-node__pulse midi-viz-node__pulse--${state}`} aria-hidden />
      </header>
      <div className="midi-viz-node__title midi-viz-node__title--mono" title={data.label}>
        {data.label}
      </div>
      <footer className="midi-viz-node__footer">
        <span className="midi-viz-node__rate">{rateLabel(data.rateHz)}</span>
      </footer>
    </div>
  )
}

export const MIDI_VISUALIZATION_NODE_TYPES = {
  midiVisualizationDevice: DeviceNodeBody,
  midiVisualizationMapping: MappingNodeBody,
  midiVisualizationTarget: TargetNodeBody,
} as const
