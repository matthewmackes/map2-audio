import { Add, Flash, Renew, TrashCan } from '@carbon/icons-react'
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
  type IntelFXMorphRequest,
  type IntelFXScene,
  type IntelFXSetlist,
} from '../../../../map2/intelfxApi'
import { useIntelFXPageContext } from './IntelFXShell'
import { EmptyState } from '../../shared/EmptyState'
import { formatIntelFXProgramNumber } from './programNumber'
import { NumberInput } from '../../ParameterControl'
import './IntelFXScenePanel.css'

const MORPH_CURVES: IntelFXMorphRequest['curve'][] = ['linear', 'ease_in', 'ease_out', 's_curve']

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 2
  }
  return Math.min(60, Math.max(0.05, seconds))
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) {
    return 120
  }
  return Math.min(300, Math.max(20, Math.round(bpm)))
}

export function IntelFXScenePanel() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [scenes, setScenes] = useState<IntelFXScene[]>([])
  const [setlists, setSetlists] = useState<IntelFXSetlist[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const [newSceneName, setNewSceneName] = useState('')
  const [morphSceneA, setMorphSceneA] = useState('')
  const [morphSceneB, setMorphSceneB] = useState('')
  const [morphDuration, setMorphDuration] = useState(2)
  const [morphCurve, setMorphCurve] = useState<IntelFXMorphRequest['curve']>('linear')
  const [morphBeatSync, setMorphBeatSync] = useState(false)
  const [morphBpm, setMorphBpm] = useState(120)
  const [morphJobId, setMorphJobId] = useState<string | null>(null)

  const [newSetlistName, setNewSetlistName] = useState('')
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>('')
  const [setlistSceneId, setSetlistSceneId] = useState<string>('')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [scenePayload, setlistPayload] = await Promise.all([
        intelfxApi.listScenes(nodeId),
        intelfxApi.listSetlists(nodeId),
      ])
      setScenes(scenePayload.scenes)
      setSetlists(setlistPayload.setlists)
      if (!selectedSetlistId && setlistPayload.setlists.length > 0) {
        setSelectedSetlistId(setlistPayload.setlists[0].id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [nodeId, selectedSetlistId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const currentProgram = intelfx.state?.current_program ?? 0

  const sceneLookup = useMemo(() => {
    const lookup = new Map<string, IntelFXScene>()
    for (const scene of scenes) {
      lookup.set(scene.id, scene)
    }
    return lookup
  }, [scenes])

  const activeSetlist = useMemo(
    () => setlists.find((setlist) => setlist.id === selectedSetlistId) ?? null,
    [setlists, selectedSetlistId],
  )

  const handleCaptureScene = useCallback(async () => {
    const name = newSceneName.trim() || `Scene ${scenes.length + 1}`
    setIsBusy(true)
    try {
      await intelfxApi.captureScene(name, [], nodeId)
      setNewSceneName('')
      setLcdText(`SCENE CAPTURED · ${name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [newSceneName, scenes.length, nodeId, refresh, setLcdText])

  const handleRecallScene = useCallback(async (sceneId: string) => {
    setIsBusy(true)
    try {
      const result = await intelfxApi.recallScene(sceneId, nodeId)
      setLcdText(`SCENE RECALLED · ${formatIntelFXProgramNumber(result.program)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, setLcdText])

  const handleDeleteScene = useCallback(async (sceneId: string) => {
    setIsBusy(true)
    try {
      await intelfxApi.deleteScene(sceneId, nodeId)
      setLcdText('SCENE DELETED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, refresh, setLcdText])

  const handleMomentaryPress = useCallback(async (sceneId: string) => {
    try {
      await intelfxApi.momentaryPress(sceneId, nodeId)
      setLcdText(`MOMENTARY HOLD · ${sceneLookup.get(sceneId)?.name ?? sceneId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, sceneLookup, setLcdText])

  const handleMomentaryRelease = useCallback(async (sceneId: string) => {
    try {
      await intelfxApi.momentaryRelease(sceneId, nodeId)
      setLcdText(`MOMENTARY RELEASE · ${sceneLookup.get(sceneId)?.name ?? sceneId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, sceneLookup, setLcdText])

  const handleStartMorph = useCallback(async () => {
    if (!morphSceneA || !morphSceneB || morphSceneA === morphSceneB) {
      return
    }

    setIsBusy(true)
    try {
      const result = await intelfxApi.startMorph({
        scene_id_a: morphSceneA,
        scene_id_b: morphSceneB,
        duration_sec: clampDuration(morphDuration),
        curve: morphCurve,
        beat_sync: morphBeatSync,
        bpm: morphBeatSync ? clampBpm(morphBpm) : undefined,
      }, nodeId)
      setMorphJobId(result.job_id)
      setLcdText('MORPH STARTED')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [morphSceneA, morphSceneB, morphDuration, morphCurve, morphBeatSync, morphBpm, nodeId, setLcdText])

  const handleCancelMorph = useCallback(async () => {
    if (!morphJobId) {
      return
    }

    setIsBusy(true)
    try {
      await intelfxApi.cancelMorph(morphJobId, nodeId)
      setMorphJobId(null)
      setLcdText('MORPH CANCELLED')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [morphJobId, nodeId, setLcdText])

  const handleCreateSetlist = useCallback(async () => {
    const name = newSetlistName.trim()
    if (!name) {
      return
    }

    setIsBusy(true)
    try {
      const created = await intelfxApi.createSetlist(name, nodeId)
      setNewSetlistName('')
      setSelectedSetlistId(created.id)
      setLcdText(`SETLIST CREATED · ${created.name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [newSetlistName, nodeId, refresh, setLcdText])

  const persistSetlistSongs = useCallback(async (songs: IntelFXSetlist['songs']) => {
    if (!activeSetlist) {
      return
    }
    setIsBusy(true)
    try {
      const updated = await intelfxApi.updateSetlist(activeSetlist.id, { songs }, nodeId)
      setSetlists((previous) => previous.map((setlist) => (setlist.id === updated.id ? updated : setlist)))
      setLcdText(`SETLIST UPDATED · ${updated.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [activeSetlist, nodeId, setLcdText])

  const handleAddSceneToSetlist = useCallback(async () => {
    if (!activeSetlist || !setlistSceneId) {
      return
    }
    const scene = sceneLookup.get(setlistSceneId)
    if (!scene) {
      return
    }

    const nextSongs = [
      ...activeSetlist.songs,
      {
        name: scene.name,
        scenes: [scene.id],
        footswitch_bindings: {},
      },
    ]
    await persistSetlistSongs(nextSongs)
    setSetlistSceneId('')
  }, [activeSetlist, sceneLookup, setlistSceneId, persistSetlistSongs])

  const handleMoveSong = useCallback(async (index: number, direction: -1 | 1) => {
    if (!activeSetlist) {
      return
    }
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= activeSetlist.songs.length) {
      return
    }
    const nextSongs = [...activeSetlist.songs]
    const [song] = nextSongs.splice(index, 1)
    nextSongs.splice(targetIndex, 0, song)
    await persistSetlistSongs(nextSongs)
  }, [activeSetlist, persistSetlistSongs])

  const handleRemoveSong = useCallback(async (index: number) => {
    if (!activeSetlist) {
      return
    }
    const nextSongs = activeSetlist.songs.filter((_, songIndex) => songIndex !== index)
    await persistSetlistSongs(nextSongs)
  }, [activeSetlist, persistSetlistSongs])

  return (
    <div className="intelfx-scene">
      <Layer className="intelfx-scene__hero">
        <div className="intelfx-scene__hero-copy">
          <h2 className="intelfx-scene__title">
            <Flash size={20} aria-hidden />
            Perform mode
          </h2>
          <p className="intelfx-scene__subtitle">
            Build scenes, run morph transitions, and organize live setlists.
          </p>
        </div>
        <div className="intelfx-scene__hero-tags">
          <Tag type="blue">{scenes.length} scenes</Tag>
          <Tag type="gray">Current {formatIntelFXProgramNumber(currentProgram)}</Tag>
          <Button size="sm" kind="ghost" renderIcon={Renew} onClick={() => void refresh()} disabled={isLoading || isBusy}>
            Refresh
          </Button>
        </div>
      </Layer>

      {isLoading ? <InlineLoading status="active" description="Refreshing IntelFX scenes and setlists..." /> : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="IntelFX perform workflow error"
          subtitle={error}
        />
      ) : null}

      <Layer className="intelfx-scene__capture">
        <TextInput
          id="intelfx-scene-name"
          size="sm"
          labelText="Capture scene name"
          value={newSceneName}
          placeholder="Scene name"
          onChange={(event) => setNewSceneName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleCaptureScene()
            }
          }}
        />
        <Button size="sm" kind="primary" renderIcon={Add} onClick={() => void handleCaptureScene()} disabled={isBusy}>
          Capture scene
        </Button>
      </Layer>

      <Layer className="intelfx-scene__cards">
        {scenes.map((scene) => (
          <article key={scene.id} className="intelfx-scene__card">
            <h3>{scene.name}</h3>
            <p>{formatIntelFXProgramNumber(scene.program)} · {scene.param_count} params</p>
            <p>{new Date(scene.created_at).toLocaleString()}</p>
            <div className="intelfx-scene__card-tags">
              {scene.tags.length > 0 ? scene.tags.map((tag) => (
                <Tag key={`${scene.id}-${tag}`} type="cool-gray">{tag}</Tag>
              )) : <Tag type="cool-gray">No tags</Tag>}
            </div>
            <div className="intelfx-scene__card-actions">
              <Button size="sm" kind="primary" onClick={() => void handleRecallScene(scene.id)} disabled={isBusy}>
                Recall
              </Button>
              <Button
                size="sm"
                kind="secondary"
                onPointerDown={() => void handleMomentaryPress(scene.id)}
                onPointerUp={() => void handleMomentaryRelease(scene.id)}
                onPointerLeave={() => void handleMomentaryRelease(scene.id)}
                disabled={isBusy}
              >
                Hold
              </Button>
              <Button size="sm" kind="danger--tertiary" renderIcon={TrashCan} onClick={() => void handleDeleteScene(scene.id)} disabled={isBusy}>
                Delete
              </Button>
            </div>
          </article>
        ))}
        {scenes.length === 0 ? (
          <EmptyState
            className="intelfx-scene__empty"
            title="No scenes captured yet"
            description="Capture or create a scene to manage IntelFX snapshots here."
            compact
            align="left"
          />
        ) : null}
      </Layer>

      <Layer className="intelfx-scene__morph">
        <h3>Scene morph</h3>
        <div className="intelfx-scene__morph-grid">
          <Select
            id="intelfx-morph-scene-a"
            labelText="Scene A"
            size="sm"
            value={morphSceneA}
            onChange={(event) => setMorphSceneA(event.target.value)}
          >
            <SelectItem value="" text="Select scene" />
            {scenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id} text={scene.name} />
            ))}
          </Select>
          <Select
            id="intelfx-morph-scene-b"
            labelText="Scene B"
            size="sm"
            value={morphSceneB}
            onChange={(event) => setMorphSceneB(event.target.value)}
          >
            <SelectItem value="" text="Select scene" />
            {scenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id} text={scene.name} />
            ))}
          </Select>
          <NumberInput
            label="Duration (seconds)"
            value={morphDuration}
            min={0.05}
            max={60}
            step={0.05}
            size="small"
            showBounds={false}
            onChange={(value) => setMorphDuration(clampDuration(value))}
          />
          <Select
            id="intelfx-morph-curve"
            labelText="Curve"
            size="sm"
            value={morphCurve}
            onChange={(event) => setMorphCurve(event.target.value as IntelFXMorphRequest['curve'])}
          >
            {MORPH_CURVES.map((curve) => (
              <SelectItem key={curve} value={curve} text={curve.replace('_', ' ')} />
            ))}
          </Select>
          <label className="intelfx-scene__checkbox">
            <input
              type="checkbox"
              checked={morphBeatSync}
              onChange={(event) => setMorphBeatSync(event.target.checked)}
            />
            Beat sync
          </label>
          {morphBeatSync ? (
            <NumberInput
              label="BPM"
              value={morphBpm}
              min={20}
              max={300}
              step={1}
              size="small"
              showBounds={false}
              onChange={(value) => setMorphBpm(clampBpm(value))}
            />
          ) : null}
        </div>
        <div className="intelfx-scene__morph-actions">
          {morphJobId ? (
            <Button size="sm" kind="danger" onClick={() => void handleCancelMorph()} disabled={isBusy}>
              Cancel morph
            </Button>
          ) : (
            <Button
              size="sm"
              kind="primary"
              onClick={() => void handleStartMorph()}
              disabled={!morphSceneA || !morphSceneB || morphSceneA === morphSceneB || isBusy}
            >
              Start morph
            </Button>
          )}
        </div>
      </Layer>

      <Layer className="intelfx-scene__setlist">
        <h3>Setlist manager</h3>
        <div className="intelfx-scene__setlist-create">
          <TextInput
            id="intelfx-setlist-name"
            labelText="New setlist name"
            size="sm"
            value={newSetlistName}
            onChange={(event) => setNewSetlistName(event.target.value)}
          />
          <Button size="sm" kind="primary" onClick={() => void handleCreateSetlist()} disabled={!newSetlistName.trim() || isBusy}>
            Create setlist
          </Button>
        </div>

        <div className="intelfx-scene__setlist-select">
          <Select
            id="intelfx-setlist-select"
            labelText="Active setlist"
            size="sm"
            value={selectedSetlistId}
            onChange={(event) => setSelectedSetlistId(event.target.value)}
          >
            <SelectItem value="" text="Select setlist" />
            {setlists.map((setlist) => (
              <SelectItem key={setlist.id} value={setlist.id} text={setlist.name} />
            ))}
          </Select>

          <Select
            id="intelfx-setlist-scene"
            labelText="Scene to add"
            size="sm"
            value={setlistSceneId}
            onChange={(event) => setSetlistSceneId(event.target.value)}
          >
            <SelectItem value="" text="Select scene" />
            {scenes.map((scene) => (
              <SelectItem key={`setlist-scene-${scene.id}`} value={scene.id} text={scene.name} />
            ))}
          </Select>

          <Button
            size="sm"
            kind="tertiary"
            onClick={() => void handleAddSceneToSetlist()}
            disabled={!activeSetlist || !setlistSceneId || isBusy}
          >
            Add song
          </Button>
        </div>

        {activeSetlist ? (
          <div className="intelfx-scene__setlist-songs">
            {activeSetlist.songs.map((song, index) => (
              <div key={`${song.name}-${index}`} className="intelfx-scene__setlist-row">
                <div>
                  <strong>{song.name}</strong>
                  <p>{song.scenes.map((sceneId) => sceneLookup.get(sceneId)?.name ?? sceneId).join(', ')}</p>
                </div>
                <div className="intelfx-scene__setlist-row-actions">
                  <Button size="sm" kind="ghost" onClick={() => void handleMoveSong(index, -1)} disabled={index === 0 || isBusy}>↑</Button>
                  <Button size="sm" kind="ghost" onClick={() => void handleMoveSong(index, 1)} disabled={index === activeSetlist.songs.length - 1 || isBusy}>↓</Button>
                  <Button size="sm" kind="danger--tertiary" onClick={() => void handleRemoveSong(index)} disabled={isBusy}>Remove</Button>
                </div>
              </div>
            ))}
            {activeSetlist.songs.length === 0 ? <p className="intelfx-scene__empty">No songs in this setlist.</p> : null}
          </div>
        ) : (
          <p className="intelfx-scene__empty">Create or select a setlist to manage song order.</p>
        )}
      </Layer>
    </div>
  )
}

export default IntelFXScenePanel
