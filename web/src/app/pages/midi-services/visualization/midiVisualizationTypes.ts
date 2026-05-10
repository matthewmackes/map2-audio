/**
 * T2500-MV — shared types for the MIDI Connections Visualization.
 *
 * The backend topology endpoint and WS endpoint both speak in node-id
 * strings of the form `<kind>:<key>`. The frontend wraps these in
 * typed structures so layout, rendering, and the activity engine
 * never have to parse the wire shape.
 */

export type MidiVisualizationNodeKind = 'device' | 'mapping' | 'target'

export interface MidiVisualizationTopologyNode {
  id: string
  kind: MidiVisualizationNodeKind
  label: string
  raw: Record<string, unknown>
}

export interface MidiVisualizationTopologyEdge {
  source: string
  target: string
}

export interface MidiVisualizationTopology {
  nodes: MidiVisualizationTopologyNode[]
  edges: MidiVisualizationTopologyEdge[]
}

export type MidiVisualizationEventKind = 'raw' | 'dispatched'

export interface MidiVisualizationEvent {
  kind: MidiVisualizationEventKind
  source_node_id: string
  target_node_id: string
  ts_ms: number
  raw_hex?: string
  status_byte?: number
  controller_key?: string
  target?: string
  action?: string
  value?: number | null
}

export type MidiVisualizationEventKindFilter = 'raw' | 'dispatched' | 'both'

export interface MidiVisualizationFilterState {
  /** Drop MIDI clock + active sense from animation (default true). */
  dropClockAndActiveSense: boolean
  /** Which kind of events animate the canvas. */
  eventKind: MidiVisualizationEventKindFilter
  /** Damps particle alpha + edge thickness saturation in [0..1]. */
  intensity: number
  /** Hide edges that have not seen activity in the last 60 s. */
  scopeActiveLast60s: boolean
}

export const DEFAULT_FILTER_STATE: MidiVisualizationFilterState = {
  dropClockAndActiveSense: true,
  eventKind: 'both',
  intensity: 1,
  scopeActiveLast60s: true,
}
