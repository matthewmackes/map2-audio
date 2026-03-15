import { Add, Music, Renew, Save, TrashCan, Waveform } from '@carbon/icons-react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  intelfxApi,
  type IntelFXMidiCurve,
  type IntelFXMidiMap,
  type IntelFXMidiMapping,
  type IntelFXMappingMode,
  type IntelFXRegistryParam,
} from '../../../map2/intelfxApi'
import { useIntelFXPageContext } from '../../pages/IntelFXPage'
import './IntelFXMidiMapper.css'

const CURVES: IntelFXMidiCurve[] = ['linear', 'log', 'exp', 's_curve', 'reverse']
const MODES: IntelFXMappingMode[] = ['continuous', 'momentary', 'toggle']

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultMapping(targetParamId: string): IntelFXMidiMapping {
  return {
    id: createId('map'),
    cc: 1,
    channel: 1,
    target_param_id: targetParamId,
    source_min: 0,
    source_max: 127,
    target_min: 0,
    target_max: 127,
    curve: 'linear',
    smoothing_ms: 40,
    polarity: 'normal',
    mode: 'continuous',
    enabled: true,
  }
}

function defaultMap(name: string): IntelFXMidiMap {
  return {
    id: createId('midimap'),
    name,
    mappings: [],
    description: '',
    active: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  }
}

function midiBadgeLabel(mapping: IntelFXMidiMapping): string {
  return `CC ${String(clampInt(mapping.cc, 0, 127)).padStart(3, '0')} · CH ${clampInt(mapping.channel, 1, 16)}`
}

interface MidiCcBadgeProps {
  mapping: IntelFXMidiMapping
}

function MidiCcBadge({ mapping }: MidiCcBadgeProps) {
  return <span className="intelfx-midi-mapper__cc-badge">{midiBadgeLabel(mapping)}</span>
}

function resolveTargetRange(targetParam: IntelFXRegistryParam | undefined): { min: number; max: number } {
  if (!targetParam?.range) {
    return { min: 0, max: 127 }
  }
  return {
    min: Number.isFinite(targetParam.range.min) ? Number(targetParam.range.min) : 0,
    max: Number.isFinite(targetParam.range.max) ? Number(targetParam.range.max) : 127,
  }
}

export function IntelFXMidiMapper() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [maps, setMaps] = useState<IntelFXMidiMap[]>([])
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [learnTargetParamId, setLearnTargetParamId] = useState<string | null>(null)
  const [newMapName, setNewMapName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetParams = useMemo(() => intelfx.registry?.params ?? [], [intelfx.registry?.params])
  const paramLookup = useMemo(() => {
    const entries = targetParams.map((param) => [param.id, param.display_name] as const)
    return Object.fromEntries(entries)
  }, [targetParams])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const payload = await intelfxApi.getMidiMaps(nodeId)
      setMaps(payload.maps)
      setActiveMapId(payload.active_map_id)
      setLearnTargetParamId(payload.learn_target_param_id)
      setIsDirty(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeMap = useMemo(
    () => maps.find((item) => item.id === activeMapId) ?? null,
    [maps, activeMapId],
  )

  const updateActiveMap = useCallback((updater: (current: IntelFXMidiMap) => IntelFXMidiMap) => {
    setMaps((previous) => previous.map((map) => {
      if (!activeMapId || map.id !== activeMapId) {
        return map
      }
      return updater(map)
    }))
    setIsDirty(true)
  }, [activeMapId])

  const handleCreateMap = useCallback(async () => {
    const name = newMapName.trim()
    if (!name) {
      return
    }

    try {
      const payload = await intelfxApi.saveMidiMap(defaultMap(name), true, nodeId)
      setNewMapName('')
      setLcdText(`MIDI MAP CREATED · ${payload.map.name}`)
      await refresh()
      setActiveMapId(payload.active_map_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [newMapName, nodeId, refresh, setLcdText])

  const handleActivate = useCallback(async (mapId: string) => {
    try {
      await intelfxApi.activateMidiMap(mapId, nodeId)
      setActiveMapId(mapId)
      setLcdText('MIDI MAP ACTIVATED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, refresh, setLcdText])

  const handleDelete = useCallback(async () => {
    if (!activeMap) {
      return
    }
    try {
      await intelfxApi.deleteMidiMap(activeMap.id, nodeId)
      setLcdText(`MIDI MAP DELETED · ${activeMap.name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [activeMap, nodeId, refresh, setLcdText])

  const handleSave = useCallback(async () => {
    if (!activeMap) {
      return
    }

    setIsSaving(true)
    try {
      const payload = await intelfxApi.saveMidiMap(activeMap, true, nodeId)
      setActiveMapId(payload.active_map_id)
      setIsDirty(false)
      setLcdText(`MIDI MAP SAVED · ${activeMap.name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }, [activeMap, nodeId, refresh, setLcdText])

  const handleAddRow = useCallback(() => {
    if (!activeMapId) {
      return
    }

    const fallbackParamId = targetParams[0]?.id
    if (!fallbackParamId) {
      setError('IntelFX registry is required before adding mappings.')
      return
    }

    updateActiveMap((map) => {
      const targetParam = targetParams.find((param) => param.id === fallbackParamId)
      const next = defaultMapping(fallbackParamId)
      const targetRange = resolveTargetRange(targetParam)
      next.target_min = targetRange.min
      next.target_max = targetRange.max
      return {
        ...map,
        mappings: [...map.mappings, next],
        updated_at: Date.now(),
      }
    })
  }, [activeMapId, targetParams, updateActiveMap])

  const handleRemoveRow = useCallback((mappingId: string) => {
    updateActiveMap((map) => ({
      ...map,
      mappings: map.mappings.filter((mapping) => mapping.id !== mappingId),
      updated_at: Date.now(),
    }))
  }, [updateActiveMap])

  const handleUpdateRow = useCallback((mappingId: string, patch: Partial<IntelFXMidiMapping>) => {
    updateActiveMap((map) => ({
      ...map,
      mappings: map.mappings.map((mapping) => {
        if (mapping.id !== mappingId) {
          return mapping
        }
        return {
          ...mapping,
          ...patch,
        }
      }),
      updated_at: Date.now(),
    }))
  }, [updateActiveMap])

  const handleLearn = useCallback(async (targetParamId: string | null) => {
    try {
      await intelfxApi.setMidiLearnTarget(targetParamId, nodeId)
      setLearnTargetParamId(targetParamId)
      setLcdText(targetParamId ? `MIDI LEARN · ${paramLookup[targetParamId] ?? targetParamId}` : 'MIDI LEARN OFF')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, paramLookup, refresh, setLcdText])

  return (
    <div className="intelfx-midi-mapper">
      <Layer className="intelfx-midi-mapper__hero">
        <div className="intelfx-midi-mapper__hero-copy">
          <h2 className="intelfx-midi-mapper__title">
            <Music size={20} aria-hidden />
            MIDI mapper
          </h2>
          <p className="intelfx-midi-mapper__subtitle">
            Manage CC-to-parameter routes for IntelFX. Edit rows, save maps, and run MIDI learn.
          </p>
        </div>
        <div className="intelfx-midi-mapper__hero-tags">
          <Tag type="gray">{maps.length} maps</Tag>
          <Tag type={learnTargetParamId ? 'green' : 'cool-gray'}>
            {learnTargetParamId ? 'Learn armed' : 'Learn idle'}
          </Tag>
        </div>
      </Layer>

      {isLoading ? <InlineLoading status="active" description="Refreshing IntelFX MIDI maps..." /> : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MIDI mapper error"
          subtitle={error}
        />
      ) : null}

      <Layer className="intelfx-midi-mapper__toolbar">
        <div className="intelfx-midi-mapper__toolbar-left">
          <Select
            id="intelfx-midi-map-select"
            labelText="Active map"
            size="sm"
            value={activeMapId ?? ''}
            onChange={(event) => {
              const mapId = event.target.value
              if (mapId) {
                void handleActivate(mapId)
              }
            }}
          >
            <SelectItem value="" text="No map selected" />
            {maps.map((map) => (
              <SelectItem key={map.id} value={map.id} text={map.name} />
            ))}
          </Select>

          <TextInput
            id="intelfx-midi-map-name"
            size="sm"
            labelText="New MIDI map name"
            value={newMapName}
            placeholder="Enter map name"
            onChange={(event) => setNewMapName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleCreateMap()
              }
            }}
          />

          <Button
            kind="primary"
            size="sm"
            renderIcon={Add}
            onClick={() => void handleCreateMap()}
            disabled={!newMapName.trim()}
          >
            Create map
          </Button>
        </div>

        <div className="intelfx-midi-mapper__toolbar-right">
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={handleAddRow} disabled={!activeMap}>
            Add row
          </Button>
          <Button kind="secondary" size="sm" renderIcon={Save} onClick={() => void handleSave()} disabled={!activeMap || !isDirty || isSaving}>
            {isSaving ? 'Saving...' : 'Save map'}
          </Button>
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button kind="danger--tertiary" size="sm" renderIcon={TrashCan} onClick={() => void handleDelete()} disabled={!activeMap}>
            Delete map
          </Button>
        </div>
      </Layer>

      {!activeMap ? (
        <Layer className="intelfx-midi-mapper__empty">
          No active MIDI map. Create a new map to begin assigning CC routes.
        </Layer>
      ) : (
        <Layer className="intelfx-midi-mapper__table-wrap">
          <table className="intelfx-midi-mapper__table">
            <thead>
              <tr>
                <th>Source</th>
                <th>CC</th>
                <th>Ch</th>
                <th>Target</th>
                <th>Range</th>
                <th>Curve</th>
                <th>Mode</th>
                <th>Learn</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeMap.mappings.map((mapping) => {
                const selectedTarget = targetParams.find((param) => param.id === mapping.target_param_id)
                const isLearningThis = learnTargetParamId === mapping.target_param_id

                return (
                  <tr key={mapping.id}>
                    <td>
                      <MidiCcBadge mapping={mapping} />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={127}
                        value={mapping.cc}
                        aria-label={`Mapping ${mapping.id} cc`}
                        onChange={(event) => {
                          const value = clampInt(Number(event.target.value), 0, 127)
                          handleUpdateRow(mapping.id, { cc: value })
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={mapping.channel}
                        aria-label={`Mapping ${mapping.id} channel`}
                        onChange={(event) => {
                          const value = clampInt(Number(event.target.value), 1, 16)
                          handleUpdateRow(mapping.id, { channel: value })
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={mapping.target_param_id}
                        aria-label={`Mapping ${mapping.id} target`}
                        onChange={(event) => {
                          const nextTarget = event.target.value
                          const targetParam = targetParams.find((param) => param.id === nextTarget)
                          const nextRange = resolveTargetRange(targetParam)
                          handleUpdateRow(mapping.id, {
                            target_param_id: nextTarget,
                            target_min: nextRange.min,
                            target_max: nextRange.max,
                          })
                        }}
                      >
                        {targetParams.map((param) => (
                          <option key={param.id} value={param.id}>
                            {param.display_name}
                          </option>
                        ))}
                      </select>
                      <div className="intelfx-midi-mapper__target-hint">
                        {selectedTarget?.display_name ?? mapping.target_param_id}
                      </div>
                    </td>
                    <td>
                      <div className="intelfx-midi-mapper__range-grid">
                        <input
                          type="number"
                          value={mapping.target_min}
                          aria-label={`Mapping ${mapping.id} target minimum`}
                          onChange={(event) => {
                            handleUpdateRow(mapping.id, { target_min: Number(event.target.value) || 0 })
                          }}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          value={mapping.target_max}
                          aria-label={`Mapping ${mapping.id} target maximum`}
                          onChange={(event) => {
                            handleUpdateRow(mapping.id, { target_max: Number(event.target.value) || 0 })
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <select
                        value={mapping.curve}
                        aria-label={`Mapping ${mapping.id} curve`}
                        onChange={(event) => {
                          handleUpdateRow(mapping.id, { curve: event.target.value as IntelFXMidiCurve })
                        }}
                      >
                        {CURVES.map((curve) => (
                          <option key={curve} value={curve}>
                            {curve}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={mapping.mode}
                        aria-label={`Mapping ${mapping.id} mode`}
                        onChange={(event) => {
                          handleUpdateRow(mapping.id, { mode: event.target.value as IntelFXMappingMode })
                        }}
                      >
                        {MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Button
                        kind={isLearningThis ? 'secondary' : 'ghost'}
                        size="sm"
                        renderIcon={Waveform}
                        onClick={() => void handleLearn(isLearningThis ? null : mapping.target_param_id)}
                      >
                        {isLearningThis ? 'Armed' : 'Learn'}
                      </Button>
                    </td>
                    <td>
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={TrashCan}
                        iconDescription="Delete MIDI mapping"
                        hasIconOnly
                        onClick={() => handleRemoveRow(mapping.id)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {activeMap.mappings.length === 0 ? (
            <div className="intelfx-midi-mapper__table-empty">No mappings yet. Add a row and assign a target parameter.</div>
          ) : null}
        </Layer>
      )}
    </div>
  )
}

export default IntelFXMidiMapper
