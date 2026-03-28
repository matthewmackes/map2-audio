/**
 * audioTableColumns.ts — Column definitions and dynamic column builder for the AUDIO-TABLE page.
 *
 * Static columns are always available. Dynamic parameter columns are built by scanning
 * all plugins in a flow's chain. MIDI and automation column groups are togglable.
 */

import type { ChainPlugin, PluginParameter } from '../../../map2/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaticColumnKey =
  | 'position'
  | 'name'
  | 'bypass'
  | 'actions'
  | 'inputLevel'
  | 'outputLevel'

export type MidiColumnKey =
  | 'midiCc'
  | 'midiChannel'
  | 'midiCurve'
  | 'midiMin'
  | 'midiMax'

export type AutomationColumnKey =
  | 'autoArmed'
  | 'autoRecorded'

export interface ColumnDef {
  key: string
  header: string
  group: 'static' | 'midi' | 'automation' | 'parameter'
  editable: boolean
  /** For parameter columns: the plugin URI this parameter belongs to */
  pluginUri?: string
  /** For parameter columns: the parameter symbol */
  paramSymbol?: string
  /** For parameter columns: the parameter index */
  paramIndex?: number
  /** For parameter columns: min/max/default */
  paramMin?: number
  paramMax?: number
  paramDefault?: number
  paramIsToggled?: boolean
}

export interface AudioTableColumnVisibility {
  midiGroup: boolean
  automationGroup: boolean
  inputLevel: boolean
  outputLevel: boolean
  /** Dynamic per-parameter columns keyed by `pluginUri::paramSymbol` */
  parameters: Record<string, boolean>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATIC_COLUMNS: ColumnDef[] = [
  { key: 'position', header: '#', group: 'static', editable: true },
  { key: 'name', header: 'Plugin', group: 'static', editable: false },
  { key: 'bypass', header: 'Bypass', group: 'static', editable: true },
  { key: 'actions', header: '', group: 'static', editable: false },
]

export const LEVEL_COLUMNS: ColumnDef[] = [
  { key: 'inputLevel', header: 'In dB', group: 'static', editable: false },
  { key: 'outputLevel', header: 'Out dB', group: 'static', editable: false },
]

export const MIDI_COLUMNS: ColumnDef[] = [
  { key: 'midiCc', header: 'MIDI CC', group: 'midi', editable: true },
  { key: 'midiChannel', header: 'MIDI Ch', group: 'midi', editable: true },
  { key: 'midiCurve', header: 'Curve', group: 'midi', editable: true },
  { key: 'midiMin', header: 'Min', group: 'midi', editable: true },
  { key: 'midiMax', header: 'Max', group: 'midi', editable: true },
]

export const AUTOMATION_COLUMNS: ColumnDef[] = [
  { key: 'autoArmed', header: 'Armed', group: 'automation', editable: false },
  { key: 'autoRecorded', header: 'Rec', group: 'automation', editable: false },
]

export const DEFAULT_COLUMN_VISIBILITY: AudioTableColumnVisibility = {
  midiGroup: false,
  automationGroup: false,
  inputLevel: true,
  outputLevel: true,
  parameters: {},
}

// ---------------------------------------------------------------------------
// Dynamic parameter column builder
// ---------------------------------------------------------------------------

/**
 * Build dynamic parameter columns from a set of plugins and their parameters.
 * Each unique parameter (by name) across all plugins becomes a column.
 * The column key is `param::pluginUri::paramSymbol`.
 */
export function buildParameterColumns(
  plugins: ChainPlugin[],
  parametersByPlugin: Map<string, PluginParameter[]>,
): ColumnDef[] {
  const seen = new Map<string, ColumnDef>()

  for (const plugin of plugins) {
    const pluginKey = `${plugin.uri}::${plugin.position}`
    const params = parametersByPlugin.get(pluginKey)
    if (!params) continue

    for (const param of params) {
      const colKey = `param::${plugin.uri}::${param.symbol}`
      if (!seen.has(colKey)) {
        seen.set(colKey, {
          key: colKey,
          header: param.name,
          group: 'parameter',
          editable: true,
          pluginUri: plugin.uri,
          paramSymbol: param.symbol,
          paramIndex: param.index,
          paramMin: param.min,
          paramMax: param.max,
          paramDefault: param.default,
          paramIsToggled: param.is_toggled,
        })
      }
    }
  }

  return Array.from(seen.values())
}

// ---------------------------------------------------------------------------
// Assembled column list
// ---------------------------------------------------------------------------

export function assembleVisibleColumns(
  visibility: AudioTableColumnVisibility,
  parameterColumns: ColumnDef[],
): ColumnDef[] {
  const columns: ColumnDef[] = [...STATIC_COLUMNS]

  // Add visible parameter columns
  for (const col of parameterColumns) {
    if (visibility.parameters[col.key] !== false) {
      columns.push(col)
    }
  }

  // MIDI group
  if (visibility.midiGroup) {
    columns.push(...MIDI_COLUMNS)
  }

  // Automation group
  if (visibility.automationGroup) {
    columns.push(...AUTOMATION_COLUMNS)
  }

  // Levels
  if (visibility.inputLevel) {
    columns.push(LEVEL_COLUMNS[0])
  }
  if (visibility.outputLevel) {
    columns.push(LEVEL_COLUMNS[1])
  }

  return columns
}

/**
 * Build the DataTable headers array from column definitions.
 * Carbon DataTable expects { key: string; header: string }.
 */
export function toDataTableHeaders(columns: ColumnDef[]): Array<{ key: string; header: string }> {
  return columns.map(col => ({ key: col.key, header: col.header }))
}
