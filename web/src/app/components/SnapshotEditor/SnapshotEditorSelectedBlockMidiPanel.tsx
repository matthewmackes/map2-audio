import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flash, Meter, Music, Save, TrashCan } from '@carbon/icons-react'
import { Button, Checkbox, InlineLoading, Layer, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react'
import {
  midiBindingsApi,
  type MidiBindingCreate,
  type MidiBindingRead,
  type MidiBindingUpdate,
} from '../../../map2/clients/midiBindings'
import { getDisplayPluginName } from '../../../map2/displayNames'
import type { ChainPlugin, MIDICurveType, MIDILearnTarget, Plugin, PluginParameter } from '../../../map2/types'
import { useToasts } from '../Toasts'
import { SnapshotSchematicReadout } from './SnapshotSchematicSurface'

type DraftScope = 'chain' | 'global'
type TestRideMode = 'heel' | 'live' | 'toe'

interface MidiActivitySummary {
  cc: number
  channel: number
  value: number
}

interface JuceGridSelectedBlockMidiPanelProps {
  plugin: ChainPlugin
  meta: Plugin
  chainId: number | null
  activeSnapshotId: number | null
  lastMidiEvent: MidiActivitySummary | null
  midiLearnInProgress: boolean
  midiLearnTarget: MIDILearnTarget | null
  onStartLearn: (parameter: PluginParameter) => void
  onStopLearn: () => void
}

// T2459-H8b — local plugin-param mapping shape used by this panel.
// Identical to the legacy `MIDIMappingV2` rendered fields except `id`
// is the canonical binding UUID (string) instead of the legacy
// integer. Bindings round-trip through `MidiBindingRead` on the wire
// and are adapted by `canonicalToPanelMapping` below so the existing
// render/draft pipeline keeps working without rewrite.
interface PanelMapping {
  id: string
  channel: number
  cc: number
  chain_id: number | null
  target_plugin_uri: string | null
  target_param_index: number | null
  target_param_symbol: string | null
  min_val: number
  max_val: number
  curve_type: MIDICurveType
  invert: boolean
  feedback_enabled: boolean
  feedback_cc: number | null
  name: string | null
  is_enabled: boolean
}

interface MidiDraft {
  cc: string
  channel: number
  scope: DraftScope
  min: string
  max: string
  curve: MIDICurveType
  invert: boolean
  feedbackEnabled: boolean
  feedbackUsesMappedCc: boolean
  feedbackCc: string
  isEnabled: boolean
}

interface ParameterMappingRow {
  parameter: PluginParameter
  currentValue: number
  mapping: PanelMapping | null
  mappingScope: DraftScope | null
  hasGlobalCompanion: boolean
}

// Compose the canonical consumer_id used by the plugin_param
// projection (`app/services/midi/projections/plugin_param.py::make_consumer_id`).
// Byte-identical to T2459-H8's helper in
// `web/src/app/pages/snapshotEditor/useSnapshotEditorMidiMutations.ts`
// so manual-save bindings list alongside Learn bindings on
// `/midi/bindings`.
function makePluginParamConsumerId(
  chainId: number,
  pluginUri: string,
  paramIndex: number,
): string {
  return `${chainId}:${pluginUri}:${paramIndex}`
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readChannelNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function readCurve(value: unknown): MIDICurveType {
  return value === 'logarithmic' || value === 'exponential' || value === 's_curve'
    ? value
    : 'linear'
}

// Adapt a canonical MidiBindingRead (consumer_type='plugin_param',
// source_type='midi_cc') into the legacy-shaped PanelMapping that this
// panel's render pipeline still expects. Inverse of `buildCreatePayload`.
function canonicalToPanelMapping(
  binding: MidiBindingRead,
  parameterMin: number,
  parameterMax: number,
): PanelMapping {
  const source = binding.source_descriptor ?? {}
  const target = binding.target_descriptor ?? {}
  const chainIdRaw = (target as Record<string, unknown>).chain_id
  const chainId = typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) ? chainIdRaw : null
  const feedbackEnabled = readBoolean((source as Record<string, unknown>).feedback_enabled, true)
  const feedbackCcRaw = (source as Record<string, unknown>).feedback_cc
  const feedbackCc = readChannelNumber(feedbackCcRaw)

  return {
    id: binding.binding_id,
    channel: readChannelNumber((source as Record<string, unknown>).channel) ?? 0,
    cc: readNumber((source as Record<string, unknown>).cc, 0),
    chain_id: chainId,
    target_plugin_uri: readString((target as Record<string, unknown>).plugin_uri),
    target_param_index: readChannelNumber((target as Record<string, unknown>).param_index),
    target_param_symbol: readString((target as Record<string, unknown>).parameter_symbol),
    min_val: readNumber((source as Record<string, unknown>).min, parameterMin),
    max_val: readNumber((source as Record<string, unknown>).max, parameterMax),
    curve_type: readCurve((source as Record<string, unknown>).curve),
    invert: readBoolean((source as Record<string, unknown>).invert, false),
    feedback_enabled: feedbackEnabled,
    feedback_cc: feedbackCc,
    name: binding.consumer_label ?? null,
    is_enabled: binding.enabled,
  }
}

const CURVE_OPTIONS: Array<{ value: MIDICurveType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'exponential', label: 'Exponential' },
  { value: 's_curve', label: 'S-Curve' },
]

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatDraftNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function sanitizeIntegerDraft(rawValue: string): string {
  return rawValue.replace(/[^0-9]/g, '')
}

function sanitizeFloatDraft(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (trimmed === '') {
    return ''
  }

  const sign = trimmed.startsWith('-') ? '-' : ''
  const unsigned = trimmed.replace(/[^0-9.]/g, '')
  const [whole = '', ...fraction] = unsigned.split('.')
  return `${sign}${whole}${fraction.length > 0 ? `.${fraction.join('')}` : ''}`
}

function parseDraftInteger(rawValue: string, min: number, max: number): number | null {
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return clampNumber(parsed, min, max)
}

function parseDraftFloat(rawValue: string): number | null {
  const parsed = Number.parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrentValue(parameter: PluginParameter, value: number): string {
  const token = `${parameter.name} ${parameter.symbol}`.toLowerCase()

  if (parameter.is_toggled) {
    return value >= 0.5 ? 'On' : 'Off'
  }
  if (token.includes('db') || token.includes('gain') || token.includes('level')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  }
  if (token.includes('hz') || token.includes('freq')) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value.toFixed(0)} Hz`
  }
  if (token.includes('ms') || token.includes('time') || token.includes('delay') || token.includes('attack') || token.includes('release')) {
    return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
  }
  if ((parameter.max === 1 && parameter.min === 0) || token.includes('mix') || token.includes('blend') || token.includes('wet') || token.includes('dry')) {
    const percent = parameter.max === 1 ? value * 100 : value
    return `${percent.toFixed(0)}%`
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

function mappingRevisionKey(mapping: PanelMapping | null): string {
  if (!mapping) {
    return 'unmapped'
  }
  return JSON.stringify([
    mapping.id,
    mapping.cc,
    mapping.channel,
    mapping.chain_id,
    mapping.min_val,
    mapping.max_val,
    mapping.curve_type,
    mapping.invert,
    mapping.feedback_enabled,
    mapping.feedback_cc,
    mapping.is_enabled,
  ])
}

function draftsMatch(a: MidiDraft | null, b: MidiDraft | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function buildDraft(
  row: ParameterMappingRow,
  chainId: number | null,
  lastMidiEvent: MidiActivitySummary | null,
): MidiDraft {
  const mapping = row.mapping
  return {
    cc: mapping ? String(mapping.cc) : (lastMidiEvent ? String(lastMidiEvent.cc) : ''),
    channel: mapping?.channel ?? lastMidiEvent?.channel ?? 1,
    scope: mapping?.chain_id === null ? 'global' : (chainId !== null ? 'chain' : 'global'),
    min: formatDraftNumber(mapping?.min_val ?? row.parameter.min),
    max: formatDraftNumber(mapping?.max_val ?? row.parameter.max),
    curve: mapping?.curve_type ?? 'linear',
    invert: mapping?.invert ?? false,
    feedbackEnabled: mapping?.feedback_enabled ?? true,
    feedbackUsesMappedCc: mapping?.feedback_cc == null,
    feedbackCc: mapping?.feedback_cc != null ? String(mapping.feedback_cc) : '',
    isEnabled: mapping?.is_enabled ?? true,
  }
}

function getEffectiveParameterMapping(
  mappings: PanelMapping[],
  parameterIndex: number,
  chainId: number | null,
): { mapping: PanelMapping | null; scope: DraftScope | null; hasGlobalCompanion: boolean } {
  const parameterMappings = mappings.filter((mapping) => mapping.target_param_index === parameterIndex)
  const chainMapping = chainId === null ? null : parameterMappings.find((mapping) => mapping.chain_id === chainId) ?? null
  const globalMapping = parameterMappings.find((mapping) => mapping.chain_id === null) ?? null

  return {
    mapping: chainMapping ?? globalMapping ?? null,
    scope: chainMapping ? 'chain' : globalMapping ? 'global' : null,
    hasGlobalCompanion: Boolean(chainMapping && globalMapping),
  }
}

function feedbackOutputChannel(channel: number): number {
  return channel > 0 ? channel : 1
}

export function JuceGridSelectedBlockMidiPanel({
  plugin,
  meta,
  chainId,
  activeSnapshotId,
  lastMidiEvent,
  midiLearnInProgress,
  midiLearnTarget,
  onStartLearn,
  onStopLearn,
}: JuceGridSelectedBlockMidiPanelProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const displayPluginName = useMemo(
    () => getDisplayPluginName(meta.name, meta.uri),
    [meta.name, meta.uri],
  )
  const [selectedParamIndex, setSelectedParamIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<MidiDraft | null>(null)
  const [draftBaseline, setDraftBaseline] = useState<MidiDraft | null>(null)

  // T2459-H8b — read from the canonical MidiBinding authority scoped to
  // the active snapshot. Returns *every* plugin_param binding for this
  // snapshot; we filter to the active plugin URI below. The wildcard
  // `consumer_id=*` path (T2459-H10) is not used here because we already
  // have a tighter scope filter; an exact-consumer-id query would
  // miss bindings created via the Learn flow for other params on the
  // same plugin.
  const mappingsQuery = useQuery({
    queryKey: ['midi', 'bindings', 'selected-block-panel', activeSnapshotId, plugin.uri],
    queryFn: async () => {
      if (activeSnapshotId == null) {
        return [] as MidiBindingRead[]
      }
      return midiBindingsApi.list({
        consumer_type: 'plugin_param',
        scope: 'snapshot',
        scope_id: String(activeSnapshotId),
      })
    },
    enabled: activeSnapshotId != null,
  })

  const invalidateMidiQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['midi'] })
  }, [queryClient])

  const createMappingMutation = useMutation({
    mutationFn: (payload: MidiBindingCreate) => midiBindingsApi.create(payload),
    onSuccess: () => {
      invalidateMidiQueries()
      pushToast('MIDI mapping created', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to create MIDI mapping', 'error')
    },
  })

  const updateMappingMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MidiBindingUpdate }) => midiBindingsApi.update(id, patch),
    onSuccess: () => {
      invalidateMidiQueries()
      pushToast('MIDI mapping updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update MIDI mapping', 'error')
    },
  })

  const deleteMappingMutation = useMutation({
    mutationFn: (bindingId: string) => midiBindingsApi.delete(bindingId),
    onSuccess: () => {
      invalidateMidiQueries()
      pushToast('MIDI mapping removed', 'info')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to remove MIDI mapping', 'error')
    },
  })

  // T2459-H8b-1 — re-enabled on the canonical-binding-keyed
  // `POST /api/midi/bindings/{id}/test` endpoint. Heel/Toe send a fixed
  // normalized value (0 / 1); Live asks the engine for the current
  // parameter value via use_current_value=true.
  const testMappingMutation = useMutation({
    mutationFn: async ({ bindingId, mode }: { bindingId: string; mode: TestRideMode }) => {
      const options = mode === 'live'
        ? { use_current_value: true }
        : { normalized_value: mode === 'heel' ? 0 : 1 }
      return midiBindingsApi.test(bindingId, options)
    },
    onSuccess: (_result, variables) => {
      pushToast(`Test-ride sent (${variables.mode})`, 'info')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Test-ride feedback failed', 'warn')
    },
  })

  const relevantMappings = useMemo<PanelMapping[]>(() => {
    const bindings = mappingsQuery.data ?? []
    const adapted = bindings
      .filter((binding) => {
        const target = binding.target_descriptor ?? {}
        return (target as Record<string, unknown>).plugin_uri === plugin.uri
      })
      .map((binding) => {
        // Resolve parameter min/max from the plugin metadata so the
        // adapter can fall back when source_descriptor omits the field
        // (older bindings authored before this slice).
        const target = binding.target_descriptor ?? {}
        const paramIndex = (target as Record<string, unknown>).param_index
        const param = typeof paramIndex === 'number'
          ? meta.parameters.find((p) => p.index === paramIndex)
          : undefined
        return canonicalToPanelMapping(
          binding,
          param?.min ?? 0,
          param?.max ?? 1,
        )
      })
    return adapted.filter((mapping) => (
      mapping.chain_id === null || (chainId !== null && mapping.chain_id === chainId)
    ))
  }, [chainId, mappingsQuery.data, meta.parameters, plugin.uri])

  const rows = useMemo<ParameterMappingRow[]>(() => (
    meta.parameters.map((parameter) => {
      const currentValue = plugin.parameters?.[parameter.symbol] ?? parameter.default
      const effective = getEffectiveParameterMapping(relevantMappings, parameter.index, chainId)
      return {
        parameter,
        currentValue,
        mapping: effective.mapping,
        mappingScope: effective.scope,
        hasGlobalCompanion: effective.hasGlobalCompanion,
      }
    })
  ), [chainId, meta.parameters, plugin.parameters, relevantMappings])

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedParamIndex(null)
      return
    }
    setSelectedParamIndex((previous) => {
      if (previous !== null && rows.some((row) => row.parameter.index === previous)) {
        return previous
      }
      return rows.find((row) => row.mapping)?.parameter.index ?? rows[0].parameter.index
    })
  }, [rows])

  const selectedRow = useMemo(
    () => rows.find((row) => row.parameter.index === selectedParamIndex) ?? null,
    [rows, selectedParamIndex],
  )

  const selectedRowRevision = useMemo(
    () => mappingRevisionKey(selectedRow?.mapping ?? null),
    [selectedRow],
  )

  useEffect(() => {
    if (!selectedRow) {
      setDraft(null)
      setDraftBaseline(null)
      return
    }
    const nextDraft = buildDraft(selectedRow, chainId, lastMidiEvent)
    setDraft(nextDraft)
    setDraftBaseline(nextDraft)
  }, [chainId, plugin.uri, selectedParamIndex, selectedRowRevision])

  const selectedParamLabel = selectedRow?.parameter.name ?? 'Parameter'
  const selectedMapping = selectedRow?.mapping ?? null
  const mappedParameterCount = rows.filter((row) => row.mapping).length
  const draftDirty = !draftsMatch(draft, draftBaseline)
  const currentValueLabel = selectedRow ? formatCurrentValue(selectedRow.parameter, selectedRow.currentValue) : ''
  const learningThisParameter = Boolean(
    selectedRow
    && midiLearnInProgress
    && midiLearnTarget
    && midiLearnTarget?.plugin_uri === plugin.uri
    && midiLearnTarget.parameter_index === selectedRow.parameter.index
    && midiLearnTarget.parameter_symbol === selectedRow.parameter.symbol,
  )

  const handleDraftChange = useCallback((updates: Partial<MidiDraft>) => {
    setDraft((previous) => (previous ? { ...previous, ...updates } : previous))
  }, [])

  const handleResetDraft = useCallback(() => {
    if (!draftBaseline) {
      return
    }
    setDraft(draftBaseline)
  }, [draftBaseline])

  const handleSaveMapping = useCallback(() => {
    if (!selectedRow || !draft) {
      return
    }

    const cc = parseDraftInteger(draft.cc, 0, 127)
    const channel = clampNumber(draft.channel, 0, 16)
    const minVal = parseDraftFloat(draft.min)
    const maxVal = parseDraftFloat(draft.max)
    const feedbackCc = draft.feedbackUsesMappedCc ? null : parseDraftInteger(draft.feedbackCc, 0, 127)

    if (cc === null) {
      pushToast('Enter a MIDI CC between 0 and 127', 'warn')
      return
    }
    if (minVal === null || maxVal === null) {
      pushToast('Enter valid minimum and maximum values', 'warn')
      return
    }
    if (!draft.feedbackUsesMappedCc && feedbackCc === null) {
      pushToast('Enter a feedback CC between 0 and 127', 'warn')
      return
    }
    if (draft.scope === 'chain' && chainId === null) {
      pushToast('Select an active chain before creating a per-chain mapping', 'warn')
      return
    }
    if (activeSnapshotId == null) {
      pushToast('Open a snapshot before saving a MIDI mapping', 'warn')
      return
    }

    const effectiveChainId = draft.scope === 'chain' ? chainId : null
    // Canonical bindings live under a single consumer_id derived from
    // (chain_id, plugin_uri, param_index). Global-scope mappings use
    // chain_id=0 in the consumer_id (sentinel) so per-chain and global
    // mappings for the same plugin/param don't collide.
    const consumerIdChain = effectiveChainId ?? 0
    const consumerId = makePluginParamConsumerId(
      consumerIdChain,
      plugin.uri,
      selectedRow.parameter.index,
    )

    const sourceDescriptor: Record<string, unknown> = {
      cc,
      channel,
      min: minVal,
      max: maxVal,
      curve: draft.curve,
      invert: draft.invert,
      feedback_enabled: draft.feedbackEnabled,
      feedback_cc: draft.feedbackEnabled ? feedbackCc : null,
    }
    const targetDescriptor: Record<string, unknown> = {
      chain_id: effectiveChainId,
      plugin_uri: plugin.uri,
      param_index: selectedRow.parameter.index,
      parameter_symbol: selectedRow.parameter.symbol,
    }

    if (selectedMapping) {
      const patch: MidiBindingUpdate = {
        consumer_label: `${displayPluginName} - ${selectedRow.parameter.name}`,
        source_descriptor: sourceDescriptor,
        target_descriptor: targetDescriptor,
        scope: 'snapshot',
        scope_id: String(activeSnapshotId),
        enabled: draft.isEnabled,
        source: 'snapshot-editor',
        modified_by: 'snapshot-editor',
      }
      updateMappingMutation.mutate({ id: selectedMapping.id, patch })
      return
    }

    const payload: MidiBindingCreate = {
      consumer_type: 'plugin_param',
      consumer_id: consumerId,
      consumer_label: `${displayPluginName} - ${selectedRow.parameter.name}`,
      source_type: 'midi_cc',
      source_descriptor: sourceDescriptor,
      target_type: 'engine_param',
      target_descriptor: targetDescriptor,
      scope: 'snapshot',
      scope_id: String(activeSnapshotId),
      enabled: draft.isEnabled,
      source: 'snapshot-editor',
      created_by: 'snapshot-editor',
    }

    createMappingMutation.mutate(payload)
  }, [
    activeSnapshotId,
    chainId,
    createMappingMutation,
    displayPluginName,
    draft,
    plugin.uri,
    pushToast,
    selectedMapping,
    selectedRow,
    updateMappingMutation,
  ])

  const handleLearnToggle = useCallback(() => {
    if (!selectedRow) {
      return
    }
    if (learningThisParameter) {
      onStopLearn()
      return
    }
    onStartLearn(selectedRow.parameter)
  }, [learningThisParameter, onStartLearn, onStopLearn, selectedRow])

  const handleDeleteMapping = useCallback(() => {
    if (!selectedMapping) {
      return
    }
    deleteMappingMutation.mutate(selectedMapping.id)
  }, [deleteMappingMutation, selectedMapping])

  const handleTestRide = useCallback((mode: TestRideMode) => {
    if (!selectedMapping) {
      pushToast('Save this mapping before sending a test ride', 'warn')
      return
    }
    if (draftDirty) {
      pushToast('Save mapping changes before sending a test ride', 'warn')
      return
    }
    testMappingMutation.mutate({ bindingId: selectedMapping.id, mode })
  }, [draftDirty, pushToast, selectedMapping, testMappingMutation])

  if (meta.parameters.length === 0) {
    return null
  }

  return (
    <div className="juce-grid-page__selected-midi-panel">
      <header className="juce-grid-page__selected-midi-panel-header">
        <div className="juce-grid-page__selected-midi-panel-copy">
          <p className="juce-grid-page__selected-midi-panel-title">
            <Music size={16} />
            <span>Selected block MIDI</span>
          </p>
          <h2 className="juce-grid-page__selected-midi-panel-heading">MIDI parameters</h2>
          <p>{`${displayPluginName} · Focused mapping, feedback, and controller test rides.`}</p>
        </div>
        <div className="juce-grid-page__selected-midi-panel-tags">
          <Tag type="blue" size="sm">{chainId !== null ? `Chain ${chainId}` : 'Global only'}</Tag>
          <Tag type="cool-gray" size="sm">{rows.length} parameter{rows.length === 1 ? '' : 's'}</Tag>
          {lastMidiEvent && <Tag type="purple" size="sm">{`CC ${lastMidiEvent.cc} · Ch ${lastMidiEvent.channel}`}</Tag>}
          <Tag type={midiLearnInProgress ? 'green' : 'cool-gray'} size="sm">
            {midiLearnInProgress ? 'Learn live' : 'Learn idle'}
          </Tag>
        </div>
        <SnapshotSchematicReadout
          label="MIDI map"
          value={`${mappedParameterCount}/${rows.length} mapped`}
          tone={mappedParameterCount > 0 ? 'active' : 'idle'}
        />
      </header>

      <Layer className="juce-grid-page__selected-midi-shell">
        <Tile className="juce-grid-page__selected-midi-grid" role="list" aria-label="Selected block MIDI parameter grid">
          <div className="juce-grid-page__selected-midi-grid-head" aria-hidden="true">
            <span>Parameter</span>
            <span>Value</span>
            <span>Mapping</span>
            <span>Feedback</span>
          </div>

          {rows.map((row) => {
            const mapped = Boolean(row.mapping)
            const feedbackLabel = !row.mapping
              ? 'Ready'
              : row.mapping.feedback_enabled
                ? `CC ${row.mapping.feedback_cc ?? row.mapping.cc}`
                : 'Off'

            return (
              <button
                type="button"
                key={row.parameter.index}
                className={`juce-grid-page__selected-midi-grid-row${row.parameter.index === selectedParamIndex ? ' is-selected' : ''}${mapped ? ' is-mapped' : ''}`}
                onClick={() => setSelectedParamIndex(row.parameter.index)}
                role="listitem"
                aria-pressed={row.parameter.index === selectedParamIndex}
              >
                <span className="juce-grid-page__selected-midi-grid-name">
                  <span className="juce-grid-page__selected-midi-grid-name-heading">{row.parameter.name}</span>
                  <small>{row.parameter.symbol}</small>
                </span>
                <span>{formatCurrentValue(row.parameter, row.currentValue)}</span>
                <span className="juce-grid-page__selected-midi-grid-badge">
                  {row.mapping
                    ? `${row.mappingScope === 'chain' ? 'Chain' : 'Global'} · CC ${row.mapping.cc}`
                    : 'Unmapped'}
                </span>
                <span>{feedbackLabel}</span>
              </button>
            )
          })}
        </Tile>

        <div className="juce-grid-page__selected-midi-inspector">
          {selectedRow && draft ? (
            <>
              <Tile className="juce-grid-page__selected-midi-inspector-hero">
                <div>
                  <span className="juce-grid-page__selected-midi-eyebrow">Focused parameter</span>
                  <h3 className="juce-grid-page__selected-midi-hero-heading">{selectedParamLabel}</h3>
                  <p>{currentValueLabel} live on the visible block.</p>
                </div>
                <div className="juce-grid-page__selected-midi-panel-tags">
                  {selectedMapping ? (
                    <>
                      <Tag type={selectedRow.mappingScope === 'chain' ? 'blue' : 'cool-gray'} size="sm">
                        {selectedRow.mappingScope === 'chain' ? 'Per-chain' : 'Global'}
                      </Tag>
                      {selectedRow.hasGlobalCompanion && <Tag type="purple" size="sm">Global companion</Tag>}
                    </>
                  ) : (
                    <Tag type="cool-gray" size="sm">Create mapping</Tag>
                  )}
                  {draftDirty && <Tag type="warm-gray" size="sm">Unsaved</Tag>}
                </div>
              </Tile>

              <div className="juce-grid-page__selected-midi-action-row">
                <Button
                  size="sm"
                  kind={learningThisParameter ? 'secondary' : 'primary'}
                  renderIcon={Flash}
                  onClick={handleLearnToggle}
                  disabled={createMappingMutation.isPending || updateMappingMutation.isPending}
                >
                  {learningThisParameter ? 'Stop learn' : 'Learn next move'}
                </Button>
                <Button
                  size="sm"
                  kind="secondary"
                  renderIcon={Save}
                  onClick={handleSaveMapping}
                  disabled={createMappingMutation.isPending || updateMappingMutation.isPending || deleteMappingMutation.isPending}
                >
                  {selectedMapping ? 'Save mapping' : 'Create mapping'}
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={handleResetDraft}
                  disabled={!draftDirty}
                >
                  Reset draft
                </Button>
                {selectedMapping && (
                  <Button
                    size="sm"
                    kind="danger--tertiary"
                    renderIcon={TrashCan}
                    onClick={handleDeleteMapping}
                    disabled={deleteMappingMutation.isPending}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="juce-grid-page__selected-midi-card-stack">
                <Tile className="juce-grid-page__selected-midi-card">
                  <div className="juce-grid-page__selected-midi-card-header">
                    <div>
                      <h3 className="juce-grid-page__selected-midi-card-heading">Control path</h3>
                      <p>Choose the incoming CC, scope, and response curve.</p>
                    </div>
                    <Tag type="cool-gray" size="sm">{draft.scope === 'chain' ? 'Per-chain default' : 'Global'}</Tag>
                  </div>

                  <div className="juce-grid-page__selected-midi-card-body">
                    <div className="juce-grid-page__selected-midi-form-grid">
                      <label>
                        <span>CC</span>
                        <TextInput
                          id={`juce-grid-selected-midi-cc-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.cc}
                          onChange={(event) => handleDraftChange({ cc: sanitizeIntegerDraft(event.currentTarget.value) })}
                          inputMode="numeric"
                          size="md"
                          hideLabel
                          labelText="CC"
                        />
                      </label>
                      <label>
                        <span>Channel</span>
                        <Select
                          id={`juce-grid-selected-midi-channel-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.channel}
                          onChange={(event) => handleDraftChange({ channel: Number(event.currentTarget.value) })}
                          labelText="Channel"
                          hideLabel
                          size="md"
                        >
                          <SelectItem value={0} text="Omni" />
                          {Array.from({ length: 16 }, (_, index) => (
                            <SelectItem key={`channel-${index + 1}`} value={index + 1} text={`Ch ${index + 1}`} />
                          ))}
                        </Select>
                      </label>
                      <label>
                        <span>Scope</span>
                        <Select
                          id={`juce-grid-selected-midi-scope-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.scope}
                          onChange={(event) => handleDraftChange({ scope: event.currentTarget.value as DraftScope })}
                          labelText="Scope"
                          hideLabel
                          size="md"
                        >
                          {chainId !== null && <SelectItem value="chain" text="Per-chain" />}
                          <SelectItem value="global" text="Global" />
                        </Select>
                      </label>
                      <label>
                        <span>Curve</span>
                        <Select
                          id={`juce-grid-selected-midi-curve-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.curve}
                          onChange={(event) => handleDraftChange({ curve: event.currentTarget.value as MIDICurveType })}
                          labelText="Curve"
                          hideLabel
                          size="md"
                        >
                          {CURVE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} text={option.label} />
                          ))}
                        </Select>
                      </label>
                      <label>
                        <span>Min</span>
                        <TextInput
                          id={`juce-grid-selected-midi-min-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.min}
                          onChange={(event) => handleDraftChange({ min: sanitizeFloatDraft(event.currentTarget.value) })}
                          inputMode="decimal"
                          size="md"
                          hideLabel
                          labelText="Min"
                        />
                      </label>
                      <label>
                        <span>Max</span>
                        <TextInput
                          id={`juce-grid-selected-midi-max-${plugin.position}-${selectedRow.parameter.index}`}
                          value={draft.max}
                          onChange={(event) => handleDraftChange({ max: sanitizeFloatDraft(event.currentTarget.value) })}
                          inputMode="decimal"
                          size="md"
                          hideLabel
                          labelText="Max"
                        />
                      </label>
                    </div>

                    <div className="juce-grid-page__selected-midi-check-row">
                      <Checkbox
                        id={`juce-grid-selected-midi-enabled-${plugin.position}-${selectedRow.parameter.index}`}
                        labelText="Mapping enabled"
                        checked={draft.isEnabled}
                        onChange={(_, data) => handleDraftChange({ isEnabled: Boolean(data.checked) })}
                      />
                      <Checkbox
                        id={`juce-grid-selected-midi-invert-${plugin.position}-${selectedRow.parameter.index}`}
                        labelText="Invert response"
                        checked={draft.invert}
                        onChange={(_, data) => handleDraftChange({ invert: Boolean(data.checked) })}
                      />
                    </div>
                  </div>
                </Tile>

                <Tile className="juce-grid-page__selected-midi-card">
                  <div className="juce-grid-page__selected-midi-card-header">
                    <div>
                      <h3 className="juce-grid-page__selected-midi-card-heading">MIDI feedback</h3>
                      <p>Send the visible parameter state back to the controller.</p>
                    </div>
                    <Tag type="purple" size="sm">{`Out Ch ${feedbackOutputChannel(draft.channel)}`}</Tag>
                  </div>

                  <div className="juce-grid-page__selected-midi-card-body">
                    <div className="juce-grid-page__selected-midi-check-row">
                      <Checkbox
                        id={`juce-grid-selected-midi-feedback-${plugin.position}-${selectedRow.parameter.index}`}
                        labelText="Feedback enabled"
                        checked={draft.feedbackEnabled}
                        onChange={(_, data) => handleDraftChange({ feedbackEnabled: Boolean(data.checked) })}
                      />
                      <Checkbox
                        id={`juce-grid-selected-midi-feedback-same-${plugin.position}-${selectedRow.parameter.index}`}
                        labelText="Use mapped CC for feedback"
                        checked={draft.feedbackUsesMappedCc}
                        onChange={(_, data) => handleDraftChange({ feedbackUsesMappedCc: Boolean(data.checked) })}
                      />
                    </div>

                    {!draft.feedbackUsesMappedCc && (
                      <div className="juce-grid-page__selected-midi-form-grid juce-grid-page__selected-midi-form-grid--single">
                        <label>
                          <span>Feedback CC</span>
                          <TextInput
                            id={`juce-grid-selected-midi-feedback-cc-${plugin.position}-${selectedRow.parameter.index}`}
                            value={draft.feedbackCc}
                            onChange={(event) => handleDraftChange({ feedbackCc: sanitizeIntegerDraft(event.currentTarget.value) })}
                            inputMode="numeric"
                            size="md"
                            hideLabel
                            labelText="Feedback CC"
                          />
                        </label>
                      </div>
                    )}

                    <div className="juce-grid-page__selected-midi-feedback-note">
                      <Meter size={16} />
                      <span>
                        {draft.feedbackEnabled
                          ? `Current return path: CC ${draft.feedbackUsesMappedCc ? draft.cc || '??' : draft.feedbackCc || '??'} on Ch ${feedbackOutputChannel(draft.channel)}`
                          : 'Feedback is currently muted for this mapping.'}
                      </span>
                    </div>
                  </div>
                </Tile>

                <Tile className="juce-grid-page__selected-midi-card">
                  <div className="juce-grid-page__selected-midi-card-header">
                    <div>
                      <h3 className="juce-grid-page__selected-midi-card-heading">Learn and test ride</h3>
                      <p>Catch the next pedal move, then send heel, live, or toe feedback out to the board.</p>
                    </div>
                    {lastMidiEvent && (
                      <Tag type="cool-gray" size="sm">{`Last in ${lastMidiEvent.value} on CC ${lastMidiEvent.cc}`}</Tag>
                    )}
                  </div>

                  <div className="juce-grid-page__selected-midi-card-body">
                    <div className="juce-grid-page__selected-midi-test-row">
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={() => handleTestRide('heel')}
                        disabled={!selectedMapping || testMappingMutation.isPending}
                      >
                        Heel
                      </Button>
                      <Button
                        size="sm"
                        kind="secondary"
                        onClick={() => handleTestRide('live')}
                        disabled={!selectedMapping || testMappingMutation.isPending}
                      >
                        Live
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={() => handleTestRide('toe')}
                        disabled={!selectedMapping || testMappingMutation.isPending}
                      >
                        Toe
                      </Button>
                    </div>

                    {learningThisParameter && (
                      <div className="juce-grid-page__selected-midi-feedback-note">
                        <Flash size={16} />
                        <span>Listening for the next controller move on {selectedParamLabel}.</span>
                      </div>
                    )}
                  </div>
                </Tile>
              </div>

              {(createMappingMutation.isPending || updateMappingMutation.isPending || deleteMappingMutation.isPending || testMappingMutation.isPending) && (
                <InlineLoading
                  status="active"
                  description="Updating selected block MIDI"
                  className="juce-grid-page__selected-midi-loading"
                />
              )}
            </>
          ) : (
            <Tile className="juce-grid-page__selected-midi-empty">
              <h3 className="juce-grid-page__selected-midi-empty-heading">No parameter selected</h3>
              <p>Choose a parameter in the grid to configure MIDI for the visible block.</p>
            </Tile>
          )}
        </div>
      </Layer>
    </div>
  )
}

export default JuceGridSelectedBlockMidiPanel
