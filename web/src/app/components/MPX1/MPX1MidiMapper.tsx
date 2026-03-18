import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Add,
  Flash,
  Link,
  Renew,
  Save,
  TrashCan,
} from '@carbon/icons-react'

import {
  mpx1Api,
  type MPX1MidiMap,
  type MPX1MidiMapping,
} from '../../../map2/mpx1Api'
import { useMPX1PageContext } from '../../pages/MPX1Page'
import { NumberInput } from '../Controls/NumberInput'
import './MPX1MidiMapper.css'

interface ObservedCc {
  key: string
  cc: number
  channel: number
  lastValue: number
  lastSeen: number
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultMidiMap(name: string): MPX1MidiMap {
  return {
    id: newId('map'),
    name,
    description: '',
    active: true,
    mappings: [],
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  }
}

function defaultMapping(sourceCc: number, sourceChannel: number, targetParamId: string): MPX1MidiMapping {
  return {
    id: newId('mapping'),
    cc: sourceCc,
    channel: sourceChannel,
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

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function MPX1MidiMapper() {
  const { mpx1, nodeId, setLcdText } = useMPX1PageContext()

  const [maps, setMaps] = useState<MPX1MidiMap[]>([])
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [learnTargetParamId, setLearnTargetParamId] = useState<string | null>(null)
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null)
  const [selectedSourceCc, setSelectedSourceCc] = useState(1)
  const [selectedSourceChannel, setSelectedSourceChannel] = useState(1)
  const [selectedTargetParamId, setSelectedTargetParamId] = useState<string | null>(null)
  const [observedCc, setObservedCc] = useState<Record<string, ObservedCc>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetParams = useMemo(() => mpx1.registry?.params ?? [], [mpx1.registry?.params])

  const targetParamsByBlock = useMemo(() => {
    const groups = new Map<string, typeof targetParams>()
    for (const param of targetParams) {
      const block = String(param.block || 'other').toUpperCase()
      const existing = groups.get(block) ?? []
      existing.push(param)
      groups.set(block, existing)
    }
    return Array.from(groups.entries()).map(([block, params]) => ({
      block,
      params: params.sort((a, b) => a.display_name.localeCompare(b.display_name)),
    }))
  }, [targetParams])

  const refreshMidiMaps = useCallback(async () => {
    setIsLoading(true)
    try {
      const payload = await mpx1Api.getMidiMaps(nodeId)
      setMaps(payload.maps)
      setActiveMapId(payload.active_map_id)
      setLearnTargetParamId(payload.learn_target_param_id)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    void refreshMidiMaps()
  }, [refreshMidiMaps])

  useEffect(() => {
    const event = mpx1.lastEvent
    if (!event) {
      return
    }

    if (event.type === 'mpx1:midi_cc' && event.data && typeof event.data === 'object') {
      const cc = clampInt(Number((event.data as any).cc), 0, 127)
      const channel = clampInt(Number((event.data as any).channel), 1, 16)
      const value = clampInt(Number((event.data as any).value), 0, 127)
      const key = `${channel}:${cc}`
      setObservedCc((prev) => ({
        ...prev,
        [key]: {
          key,
          cc,
          channel,
          lastValue: value,
          lastSeen: Date.now(),
        },
      }))
      setSelectedSourceCc(cc)
      setSelectedSourceChannel(channel)
    }

    if (
      event.type === 'mpx1:midi_learn_assigned'
      || event.type === 'mpx1:midi_map_saved'
      || event.type === 'mpx1:midi_map_deleted'
      || event.type === 'mpx1:midi_map_activated'
    ) {
      void refreshMidiMaps()
    }
  }, [mpx1.lastEvent, refreshMidiMaps])

  const activeMap = useMemo(
    () => maps.find((map) => map.id === activeMapId) ?? null,
    [maps, activeMapId]
  )

  const selectedMapping = useMemo(() => {
    if (!activeMap || !selectedMappingId) {
      return null
    }
    return activeMap.mappings.find((mapping) => mapping.id === selectedMappingId) ?? null
  }, [activeMap, selectedMappingId])

  const sourceRows = useMemo(() => {
    const list = new Map<string, ObservedCc>()
    for (const mapping of activeMap?.mappings ?? []) {
      const key = `${mapping.channel}:${mapping.cc}`
      if (!list.has(key)) {
        list.set(key, {
          key,
          cc: mapping.cc,
          channel: mapping.channel,
          lastValue: 0,
          lastSeen: 0,
        })
      }
    }
    Object.entries(observedCc).forEach(([key, row]) => {
      list.set(key, row)
    })
    return Array.from(list.values()).sort((a, b) => (a.channel - b.channel) || (a.cc - b.cc))
  }, [activeMap?.mappings, observedCc])

  const persistMap = useCallback(async (nextMap: MPX1MidiMap, makeActive = true) => {
    const payload = await mpx1Api.saveMidiMap(nextMap, makeActive, nodeId)
    setLcdText(`MIDI MAP SAVED • ${payload.map.name}`)
    await refreshMidiMaps()
    setActiveMapId(payload.active_map_id)
  }, [nodeId, refreshMidiMaps, setLcdText])

  const ensureMap = useCallback(async (): Promise<MPX1MidiMap> => {
    if (activeMap) {
      return activeMap
    }
    const created = defaultMidiMap('Default Map')
    await persistMap(created, true)
    return created
  }, [activeMap, persistMap])

  const handleCreateMap = useCallback(async () => {
    const proposedName = window.prompt('New MIDI map name', 'My MIDI Map')
    if (!proposedName) return
    const map = defaultMidiMap(proposedName)
    await persistMap(map, true)
    setSelectedMappingId(null)
  }, [persistMap])

  const handleDeleteActiveMap = useCallback(async () => {
    if (!activeMap) return
    await mpx1Api.deleteMidiMap(activeMap.id, nodeId)
    setSelectedMappingId(null)
    await refreshMidiMaps()
    setLcdText(`MIDI MAP DELETED • ${activeMap.name}`)
  }, [activeMap, nodeId, refreshMidiMaps, setLcdText])

  const handleActivateMap = useCallback(async (mapId: string) => {
    await mpx1Api.activateMidiMap(mapId, nodeId)
    setActiveMapId(mapId)
    await refreshMidiMaps()
  }, [nodeId, refreshMidiMaps])

  const handleCreateMapping = useCallback(async () => {
    if (!selectedTargetParamId) {
      setError('Select a target parameter before creating a mapping.')
      return
    }

    const map = await ensureMap()
    const target = targetParams.find((param) => param.id === selectedTargetParamId)
    const mapping = defaultMapping(selectedSourceCc, selectedSourceChannel, selectedTargetParamId)
    if (target) {
      mapping.target_min = Number(target.range?.min ?? 0)
      mapping.target_max = Number(target.range?.max ?? 127)
      mapping.name = target.display_name
    }

    const nextMap: MPX1MidiMap = {
      ...map,
      mappings: [...map.mappings, mapping],
      updated_at: Date.now() / 1000,
    }
    await persistMap(nextMap, true)
    setSelectedMappingId(mapping.id)
    setError(null)
  }, [ensureMap, persistMap, selectedSourceCc, selectedSourceChannel, selectedTargetParamId, targetParams])

  const updateSelectedMapping = useCallback(async (patch: Partial<MPX1MidiMapping>) => {
    if (!activeMap || !selectedMapping) {
      return
    }

    const nextMap: MPX1MidiMap = {
      ...activeMap,
      mappings: activeMap.mappings.map((mapping) =>
        mapping.id === selectedMapping.id ? { ...mapping, ...patch } : mapping
      ),
      updated_at: Date.now() / 1000,
    }
    setMaps((prev) => prev.map((item) => (item.id === activeMap.id ? nextMap : item)))
    await persistMap(nextMap, true)
  }, [activeMap, persistMap, selectedMapping])

  const handleDeleteMapping = useCallback(async () => {
    if (!activeMap || !selectedMapping) return
    const nextMap: MPX1MidiMap = {
      ...activeMap,
      mappings: activeMap.mappings.filter((mapping) => mapping.id !== selectedMapping.id),
      updated_at: Date.now() / 1000,
    }
    setSelectedMappingId(null)
    await persistMap(nextMap, true)
  }, [activeMap, persistMap, selectedMapping])

  const handleLearn = useCallback(async () => {
    if (!selectedTargetParamId) {
      setError('Select a target parameter first for MIDI learn.')
      return
    }
    await ensureMap()
    await mpx1Api.setMidiLearnTarget(selectedTargetParamId, nodeId)
    setLearnTargetParamId(selectedTargetParamId)
    setLcdText('LEARNING MIDI CC... move a controller now')
    setError(null)
  }, [ensureMap, nodeId, selectedTargetParamId, setLcdText])

  const lines = useMemo(() => {
    if (!activeMap) return []
    return activeMap.mappings.map((mapping, index) => {
      const y = 24 + index * 42
      return {
        id: mapping.id,
        d: `M 20 ${y} C 120 ${y - 14}, 210 ${y + 14}, 310 ${y}`,
        enabled: mapping.enabled,
      }
    })
  }, [activeMap])

  return (
    <div className="mpx1-midi-map">
      <header className="mpx1-midi-map__header">
        <div className="mpx1-midi-map__map-select">
          <select
            value={activeMapId ?? ''}
            onChange={(event) => {
              const nextId = event.target.value
              if (nextId) {
                void handleActivateMap(nextId)
              }
            }}
          >
            <option value="">No active map</option>
            {maps.map((map) => (
              <option key={map.id} value={map.id}>{map.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => void handleCreateMap()}>
            <Add size={14} /> New
          </button>
          <button type="button" onClick={() => activeMap && void persistMap(activeMap, true)} disabled={!activeMap}>
            <Save size={14} /> Save
          </button>
          <button type="button" onClick={() => void handleDeleteActiveMap()} disabled={!activeMap}>
            <TrashCan size={14} /> Delete
          </button>
          <button type="button" onClick={() => void refreshMidiMaps()}>
            <Renew size={14} /> Refresh
          </button>
        </div>
        <div className={`mpx1-midi-map__learn${learnTargetParamId ? ' is-active' : ''}`}>
          <Flash size={14} />
          {learnTargetParamId ? `LEARNING ${learnTargetParamId}` : 'LEARN IDLE'}
        </div>
      </header>

      {error && <div className="mpx1-midi-map__error">{error}</div>}

      <section className="mpx1-midi-map__workspace">
        <aside className="mpx1-midi-map__column">
          <div className="mpx1-midi-map__title">MIDI Sources</div>
          <div className="mpx1-midi-map__source-picker">
                <label>
                  CC
                  <NumberInput
                    label="CC"
                    value={selectedSourceCc}
                    min={0}
                    max={127}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => setSelectedSourceCc(clampInt(value, 0, 127))}
                  />
                </label>
                <label>
                  Ch
                  <NumberInput
                    label="Channel"
                    value={selectedSourceChannel}
                    min={1}
                    max={16}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => setSelectedSourceChannel(clampInt(value, 1, 16))}
                  />
                </label>
          </div>
          <div className="mpx1-midi-map__list">
            {sourceRows.map((source) => (
              <button
                type="button"
                key={source.key}
                className={`mpx1-midi-map__list-item${selectedSourceCc === source.cc && selectedSourceChannel === source.channel ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedSourceCc(source.cc)
                  setSelectedSourceChannel(source.channel)
                }}
              >
                <span>{`CC ${source.cc.toString().padStart(3, '0')} / CH ${source.channel}`}</span>
                <span className="mpx1-midi-map__muted">{source.lastValue}</span>
              </button>
            ))}
            {sourceRows.length === 0 && <div className="mpx1-midi-map__empty">Move a controller or add a manual CC.</div>}
          </div>
        </aside>

        <main className="mpx1-midi-map__canvas-column">
          <div className="mpx1-midi-map__title">Connection Canvas</div>
          <div className="mpx1-midi-map__canvas-wrap">
            <svg viewBox={`0 0 330 ${Math.max(180, lines.length * 42 + 36)}`} className="mpx1-midi-map__svg">
              {lines.map((line) => (
                <path
                  key={line.id}
                  d={line.d}
                  className={`mpx1-midi-map__line${line.enabled ? '' : ' is-disabled'}${selectedMappingId === line.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedMappingId(line.id)}
                />
              ))}
              {lines.length === 0 && (
                <text x="16" y="38" className="mpx1-midi-map__svg-hint">
                  No mappings yet. Select source + target, then click Link.
                </text>
              )}
            </svg>
          </div>

          <div className="mpx1-midi-map__actions">
            <button type="button" onClick={() => void handleCreateMapping()}>
              <Link size={14} /> Link Source to Target
            </button>
            <button type="button" onClick={() => void handleLearn()} disabled={!selectedTargetParamId}>
              <Flash size={14} /> MIDI Learn
            </button>
          </div>

          {selectedMapping && (
            <div className="mpx1-midi-map__detail">
              <div className="mpx1-midi-map__title">Mapping Detail</div>
              <div className="mpx1-midi-map__detail-grid">
                <label>
                  CC
                  <NumberInput
                    label="Mapping CC"
                    value={selectedMapping.cc}
                    min={0}
                    max={127}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ cc: clampInt(value, 0, 127) })}
                  />
                </label>
                <label>
                  Channel
                  <NumberInput
                    label="Mapping channel"
                    value={selectedMapping.channel}
                    min={1}
                    max={16}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ channel: clampInt(value, 1, 16) })}
                  />
                </label>
                <label>
                  Source Min
                  <NumberInput
                    label="Source minimum"
                    value={selectedMapping.source_min}
                    min={0}
                    max={127}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ source_min: clampInt(value, 0, 127) })}
                  />
                </label>
                <label>
                  Source Max
                  <NumberInput
                    label="Source maximum"
                    value={selectedMapping.source_max}
                    min={0}
                    max={127}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ source_max: clampInt(value, 0, 127) })}
                  />
                </label>
                <label>
                  Target Min
                  <NumberInput
                    label="Target minimum"
                    value={selectedMapping.target_min}
                    min={-16384}
                    max={16384}
                    step={0.01}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ target_min: clampFloat(value, -16384, 16384) })}
                  />
                </label>
                <label>
                  Target Max
                  <NumberInput
                    label="Target maximum"
                    value={selectedMapping.target_max}
                    min={-16384}
                    max={16384}
                    step={0.01}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ target_max: clampFloat(value, -16384, 16384) })}
                  />
                </label>
                <label>
                  Curve
                  <select
                    value={selectedMapping.curve}
                    onChange={(event) => void updateSelectedMapping({ curve: event.target.value as MPX1MidiMapping['curve'] })}
                  >
                    <option value="linear">linear</option>
                    <option value="log">log</option>
                    <option value="exp">exp</option>
                    <option value="s_curve">s_curve</option>
                    <option value="reverse">reverse</option>
                  </select>
                </label>
                <label>
                  Smoothing (ms)
                  <NumberInput
                    label="Smoothing ms"
                    value={selectedMapping.smoothing_ms}
                    min={0}
                    max={500}
                    step={1}
                    showLabel={false}
                    showBounds={false}
                    size="small"
                    onChange={(value) => void updateSelectedMapping({ smoothing_ms: clampFloat(value, 0, 500) })}
                  />
                </label>
                <label>
                  Polarity
                  <select
                    value={selectedMapping.polarity}
                    onChange={(event) => void updateSelectedMapping({ polarity: event.target.value as MPX1MidiMapping['polarity'] })}
                  >
                    <option value="normal">normal</option>
                    <option value="inverted">inverted</option>
                  </select>
                </label>
                <label>
                  Mode
                  <select
                    value={selectedMapping.mode}
                    onChange={(event) => void updateSelectedMapping({ mode: event.target.value as MPX1MidiMapping['mode'] })}
                  >
                    <option value="continuous">continuous</option>
                    <option value="momentary">momentary</option>
                    <option value="toggle">toggle</option>
                  </select>
                </label>
                <label>
                  Macro Group
                  <input
                    type="text"
                    value={selectedMapping.macro_group ?? ''}
                    onChange={(event) => void updateSelectedMapping({ macro_group: event.target.value || undefined })}
                  />
                </label>
                <label className="mpx1-midi-map__checkbox">
                  <input
                    type="checkbox"
                    checked={selectedMapping.enabled}
                    onChange={(event) => void updateSelectedMapping({ enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <button type="button" className="mpx1-midi-map__danger" onClick={() => void handleDeleteMapping()}>
                <TrashCan size={14} /> Remove Mapping
              </button>
            </div>
          )}
        </main>

        <aside className="mpx1-midi-map__column">
          <div className="mpx1-midi-map__title">MPX1 Targets</div>
          <div className="mpx1-midi-map__list mpx1-midi-map__targets">
            {targetParamsByBlock.map((group) => (
              <div key={group.block} className="mpx1-midi-map__target-group">
                <div className="mpx1-midi-map__target-group-title">{group.block}</div>
                {group.params.map((param) => {
                  const assigned = Boolean(activeMap?.mappings.some((mapping) => mapping.target_param_id === param.id))
                  return (
                    <button
                      type="button"
                      key={param.id}
                      className={`mpx1-midi-map__list-item${selectedTargetParamId === param.id ? ' is-active' : ''}${assigned ? ' is-assigned' : ''}`}
                      onClick={() => {
                        setSelectedTargetParamId(param.id)
                        setLcdText(`TARGET SELECTED • ${param.display_name}`)
                      }}
                    >
                      <span>{param.display_name}</span>
                      <span className="mpx1-midi-map__muted">{assigned ? '•' : ''}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>
      </section>

      {isLoading && <div className="mpx1-midi-map__loading">Loading MIDI maps...</div>}
    </div>
  )
}
