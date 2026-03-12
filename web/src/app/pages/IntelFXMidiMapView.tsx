/**
 * IntelFXMidiMapView - MIDI mapper view for IntelFX.
 */

import { Add, Music, Renew, TrashCan } from '@carbon/icons-react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { mpx1Api, type MPX1MidiMap, type MPX1MidiMapsResponse } from '../../map2/mpx1Api'
import { useIntelFXPageContext } from './IntelFXPage'
import './IntelFXMidiMapView.css'

export function IntelFXMidiMapView() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [mapsData, setMapsData] = useState<MPX1MidiMapsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [newMapName, setNewMapName] = useState('')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await mpx1Api.getMidiMaps(nodeId)
      setMapsData(data)
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

  const activeMapId = mapsData?.active_map_id ?? null
  const maps = mapsData?.maps ?? []
  const learnTarget = mapsData?.learn_target_param_id ?? null

  const registryParams = intelfx.registry?.params ?? []
  const paramLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const param of registryParams) {
      lookup[param.id] = param.display_name
    }
    return lookup
  }, [registryParams])

  const handleActivateMap = useCallback(async (mapId: string) => {
    try {
      await mpx1Api.activateMidiMap(mapId, nodeId)
      setLcdText('MIDI MAP ACTIVATED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, refresh, setLcdText])

  const handleDeleteMap = useCallback(async (mapId: string) => {
    try {
      await mpx1Api.deleteMidiMap(mapId, nodeId)
      setLcdText('MIDI MAP DELETED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, refresh, setLcdText])

  const handleCreateMap = useCallback(async () => {
    if (!newMapName.trim()) {
      return
    }
    const newMap: MPX1MidiMap = {
      id: crypto.randomUUID(),
      name: newMapName.trim(),
      mappings: [],
    }
    try {
      await mpx1Api.saveMidiMap(newMap, true, nodeId)
      setNewMapName('')
      setLcdText(`MIDI MAP CREATED: ${newMap.name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [newMapName, nodeId, refresh, setLcdText])

  const handleToggleLearn = useCallback(async (paramId: string | null) => {
    try {
      const next = learnTarget === paramId ? null : paramId
      await mpx1Api.setMidiLearnTarget(next, nodeId)
      setLcdText(next ? `MIDI LEARN: ${paramLookup[next] ?? next}` : 'MIDI LEARN OFF')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [learnTarget, nodeId, paramLookup, refresh, setLcdText])

  return (
    <div className="intelfx-midi-map-page">
      <Layer className="intelfx-midi-map-page__hero">
        <div className="intelfx-midi-map-page__hero-copy">
          <h2 className="intelfx-midi-map-page__title">
            <Music size={20} aria-hidden />
            MIDI mapper
          </h2>
          <p className="intelfx-midi-map-page__subtitle">
            Create and manage MIDI CC maps for IntelFX parameters.
          </p>
        </div>
        <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={() => void refresh()} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </Layer>

      {isLoading ? <InlineLoading status="active" description="Refreshing MIDI maps..." /> : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MIDI map error"
          subtitle={error}
        />
      ) : null}

      <Layer className="intelfx-midi-map-page__create">
        <TextInput
          id="intelfx-midi-map-name"
          labelText="New MIDI map name"
          placeholder="Enter map name"
          value={newMapName}
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
      </Layer>

      {learnTarget ? (
        <div className="intelfx-midi-map-page__learn">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="MIDI learn active"
            subtitle={`Listening for control input on ${paramLookup[learnTarget] ?? learnTarget}.`}
          />
          <Button kind="ghost" size="sm" onClick={() => void handleToggleLearn(null)}>
            Cancel learn
          </Button>
        </div>
      ) : null}

      {maps.length === 0 && !isLoading ? (
        <Layer className="intelfx-midi-map-page__empty">No MIDI maps configured. Create one to start mapping controls.</Layer>
      ) : null}

      <div className="intelfx-midi-map-page__maps">
        {maps.map((map) => {
          const isActive = map.id === activeMapId
          return (
            <section key={map.id} className={`intelfx-midi-map-page__map${isActive ? ' is-active' : ''}`}>
              <header className="intelfx-midi-map-page__map-header">
                <div className="intelfx-midi-map-page__map-meta">
                  <h3 className="intelfx-midi-map-page__map-title">{map.name}</h3>
                  <Tag type={isActive ? 'green' : 'gray'}>{isActive ? 'Active' : 'Inactive'}</Tag>
                  <Tag type="cool-gray">{map.mappings.length} mappings</Tag>
                </div>
                <div className="intelfx-midi-map-page__map-actions">
                  {!isActive ? (
                    <Button kind="tertiary" size="sm" onClick={() => void handleActivateMap(map.id)}>
                      Activate
                    </Button>
                  ) : null}
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    iconDescription="Delete MIDI map"
                    hasIconOnly
                    onClick={() => void handleDeleteMap(map.id)}
                  />
                </div>
              </header>

              {map.mappings.length > 0 ? (
                <div className="intelfx-midi-map-page__table-wrap">
                  <Table size="sm" className="intelfx-midi-map-page__table">
                    <TableHead>
                      <TableRow>
                        <TableHeader>CC</TableHeader>
                        <TableHeader>Channel</TableHeader>
                        <TableHeader>Target</TableHeader>
                        <TableHeader>Range</TableHeader>
                        <TableHeader>Curve</TableHeader>
                        <TableHeader>Mode</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {map.mappings.map((mapping) => (
                        <TableRow key={mapping.id}>
                          <TableCell>CC{mapping.cc}</TableCell>
                          <TableCell>{mapping.channel + 1}</TableCell>
                          <TableCell>{paramLookup[mapping.target_param_id] ?? mapping.target_param_id}</TableCell>
                          <TableCell>{mapping.target_min}-{mapping.target_max}</TableCell>
                          <TableCell>{mapping.curve}</TableCell>
                          <TableCell>{mapping.mode}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="intelfx-midi-map-page__map-empty">No mappings in this map yet.</p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default IntelFXMidiMapView
