/**
 * T2500-MV-D4 — Filter bar for the visualization page.
 *
 * Wires the operator-facing filter controls to the page's filter
 * state. All controls flow through `useMidiVisualizationGraph`'s
 * `setFilters`; the hook applies the filter on the next rAF flush.
 */

import {
  ContentSwitcher,
  Slider,
  Switch,
  Toggle,
} from '@carbon/react'

import type {
  MidiVisualizationEventKindFilter,
  MidiVisualizationFilterState,
} from './midiVisualizationTypes'

export interface MidiVisualizationFilterBarProps {
  filters: MidiVisualizationFilterState
  onChange: (
    update: Partial<MidiVisualizationFilterState>
      | ((prev: MidiVisualizationFilterState) => MidiVisualizationFilterState),
  ) => void
}

export function MidiVisualizationFilterBar({
  filters,
  onChange,
}: MidiVisualizationFilterBarProps) {
  const eventKindIndex: Record<MidiVisualizationEventKindFilter, number> = {
    raw: 0,
    dispatched: 1,
    both: 2,
  }
  const eventKindList: MidiVisualizationEventKindFilter[] = ['raw', 'dispatched', 'both']

  return (
    <div
      className="midi-viz-filter-bar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        background: 'var(--cds-layer-01)',
        borderBottom: '1px solid var(--cds-border-subtle-01)',
      }}
    >
      <div>
        <ContentSwitcher
          aria-label="Event kind"
          selectedIndex={eventKindIndex[filters.eventKind]}
          onChange={({ index }) =>
            onChange({ eventKind: eventKindList[index] ?? 'both' })
          }
          size="sm"
        >
          <Switch name="raw" text="Raw" />
          <Switch name="dispatched" text="Dispatched" />
          <Switch name="both" text="Both" />
        </ContentSwitcher>
      </div>
      <Toggle
        id="midi-viz-clock-filter"
        labelText="Filter MIDI clock + active sense"
        labelA="Off"
        labelB="On"
        toggled={filters.dropClockAndActiveSense}
        onToggle={(checked) =>
          onChange({ dropClockAndActiveSense: checked })
        }
        size="sm"
      />
      <Toggle
        id="midi-viz-scope-active"
        labelText="Active in last 60s only"
        labelA="Off"
        labelB="On"
        toggled={filters.scopeActiveLast60s}
        onToggle={(checked) => onChange({ scopeActiveLast60s: checked })}
        size="sm"
      />
      <div style={{ minWidth: '180px' }}>
        <Slider
          id="midi-viz-intensity"
          labelText="Intensity"
          min={0}
          max={1}
          step={0.05}
          value={filters.intensity}
          hideTextInput
          onChange={({ value }) => onChange({ intensity: value })}
        />
      </div>
    </div>
  )
}

export default MidiVisualizationFilterBar
