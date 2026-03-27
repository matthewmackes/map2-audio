/**
 * MPX1ScenePanel — scene grid, morph strip, and capture bar (T038).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { mpx1Api, type MPX1Scene, type MPX1MorphRequest } from '../../../map2/mpx1Api'
import { useMPX1PageContext } from '../../pages/MPX1Page'
import { formatMpx1ProgramLabel } from './programNumber'
import { NumberInput } from '../ParameterControl'
import './MPX1ScenePanel.css'

const MORPH_CURVES = ['linear', 'ease_in', 'ease_out', 's_curve'] as const
type MorphCurve = (typeof MORPH_CURVES)[number]

// ---------------------------------------------------------------------------
// Scene button
// ---------------------------------------------------------------------------

interface SceneBtnProps {
  scene: MPX1Scene
  isActive: boolean
  onRecall: (id: string) => void
  onPress: (id: string) => void
  onRelease: (id: string) => void
  onDelete: (id: string) => void
}

function SceneBtn({ scene, isActive, onRecall, onPress, onRelease, onDelete }: SceneBtnProps) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMomentaryRef = useRef(false)

  const handlePointerDown = useCallback(() => {
    isMomentaryRef.current = false
    holdRef.current = setTimeout(() => {
      isMomentaryRef.current = true
      onPress(scene.id)
    }, 350)
  }, [scene.id, onPress])

  const handlePointerUp = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current)
      holdRef.current = null
    }
    if (isMomentaryRef.current) {
      onRelease(scene.id)
      isMomentaryRef.current = false
    } else {
      onRecall(scene.id)
    }
  }, [scene.id, onRecall, onRelease])

  const handlePointerLeave = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current)
      holdRef.current = null
    }
    if (isMomentaryRef.current) {
      onRelease(scene.id)
      isMomentaryRef.current = false
    }
  }, [scene.id, onRelease])

  return (
    <button
      type="button"
      className={`mpx1-scene-btn${isActive ? ' is-active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      title={`${scene.name} — ${formatMpx1ProgramLabel(scene.program, 'P')}\nTap to recall, hold for momentary`}
    >
      <span>{scene.name}</span>
      <span className="mpx1-scene-btn__program">{formatMpx1ProgramLabel(scene.program, 'P')}</span>
      {scene.tags.length > 0 && (
        <span className="mpx1-scene-btn__tags">
          {scene.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="mpx1-scene-btn__tag">{tag}</span>
          ))}
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Morph strip
// ---------------------------------------------------------------------------

interface MorphStripProps {
  scenes: MPX1Scene[]
  activeJobId: string | null
  onMorphStart: (req: MPX1MorphRequest) => void
  onMorphCancel: () => void
}

function MorphStrip({ scenes, activeJobId, onMorphStart, onMorphCancel }: MorphStripProps) {
  const [sceneA, setSceneA] = useState('')
  const [sceneB, setSceneB] = useState('')
  const [duration, setDuration] = useState(2.0)
  const [curve, setCurve] = useState<MorphCurve>('linear')
  const [beatSync, setBeatSync] = useState(false)
  const [bpm, setBpm] = useState(120)

  const isRunning = activeJobId !== null

  const handleStart = useCallback(() => {
    if (!sceneA || !sceneB || sceneA === sceneB) return
    onMorphStart({
      scene_id_a: sceneA,
      scene_id_b: sceneB,
      duration_sec: duration,
      curve,
      beat_sync: beatSync,
      bpm,
    })
  }, [sceneA, sceneB, duration, curve, beatSync, bpm, onMorphStart])

  return (
    <div className="mpx1-morph-strip">
      <div className="mpx1-morph-strip__header">
        <span>MORPH A ↔ B</span>
        {isRunning && <span style={{ color: '#a78bfa' }}>● Running</span>}
      </div>
      <div className="mpx1-morph-strip__controls">
        <span className="mpx1-morph-strip__label">A:</span>
        <select
          className="mpx1-morph-strip__select"
          value={sceneA}
          onChange={(e) => setSceneA(e.target.value)}
        >
          <option value="">— scene —</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <span className="mpx1-morph-strip__label">B:</span>
        <select
          className="mpx1-morph-strip__select"
          value={sceneB}
          onChange={(e) => setSceneB(e.target.value)}
        >
          <option value="">— scene —</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <span className="mpx1-morph-strip__label">{duration.toFixed(1)}s</span>
        <NumberInput
          label="Morph duration"
          value={duration}
          min={0.1}
          max={30}
          step={0.1}
          className="mpx1-morph-slider"
          showLabel={false}
          showBounds={false}
          size="small"
          onChange={(value) => setDuration(value)}
        />

        <select
          className="mpx1-morph-strip__select"
          value={curve}
          onChange={(e) => setCurve(e.target.value as MorphCurve)}
        >
          {MORPH_CURVES.map((c) => (
            <option key={c} value={c}>{c.replace('_', ' ')}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={beatSync}
            onChange={(e) => setBeatSync(e.target.checked)}
            style={{ accentColor: '#a78bfa' }}
          />
          Beat Sync
        </label>

        {beatSync && (
          <>
            <span className="mpx1-morph-strip__label">{bpm} BPM</span>
            <NumberInput
              label="Morph BPM"
              value={bpm}
              min={40}
              max={240}
              step={1}
              showLabel={false}
              showBounds={false}
              size="small"
              style={{ width: 80 }}
              onChange={(value) => setBpm(Math.round(value))}
            />
          </>
        )}

        {isRunning ? (
          <button type="button" className="mpx1-morph-strip__btn is-active" onClick={onMorphCancel}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="mpx1-morph-strip__btn"
            onClick={handleStart}
            disabled={!sceneA || !sceneB || sceneA === sceneB}
          >
            Morph →
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MPX1ScenePanel() {
  const { nodeId } = useMPX1PageContext()
  const [scenes, setScenes] = useState<MPX1Scene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [morphJobId, setMorphJobId] = useState<string | null>(null)
  const [captureName, setCaptureName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadScenes = useCallback(async () => {
    try {
      const res = await mpx1Api.listScenes(nodeId)
      setScenes(res.scenes)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId])

  useEffect(() => {
    void loadScenes()
  }, [loadScenes])

  const handleCapture = useCallback(async () => {
    const name = captureName.trim() || `Scene ${scenes.length + 1}`
    try {
      const scene = await mpx1Api.captureScene(name, [], nodeId)
      setScenes((prev) => [...prev, scene])
      setCaptureName('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [captureName, nodeId, scenes.length])

  const handleRecall = useCallback(async (id: string) => {
    try {
      await mpx1Api.recallScene(id, nodeId)
      setActiveSceneId(id)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId])

  const handlePress = useCallback(async (id: string) => {
    try {
      await mpx1Api.momentaryPress(id, nodeId)
      setActiveSceneId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId])

  const handleRelease = useCallback(async (id: string) => {
    try {
      await mpx1Api.momentaryRelease(id, nodeId)
      setActiveSceneId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await mpx1Api.deleteScene(id, nodeId)
      setScenes((prev) => prev.filter((s) => s.id !== id))
      if (activeSceneId === id) setActiveSceneId(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [activeSceneId, nodeId])

  const handleMorphStart = useCallback(async (req: MPX1MorphRequest) => {
    try {
      const res = await mpx1Api.startMorph(req, nodeId)
      setMorphJobId(res.job_id)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId])

  const handleMorphCancel = useCallback(async () => {
    if (!morphJobId) return
    try {
      await mpx1Api.cancelMorph(morphJobId, nodeId)
      setMorphJobId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [morphJobId, nodeId])

  const activeSceneName = activeSceneId
    ? (scenes.find((scene) => scene.id === activeSceneId)?.name ?? 'Unknown Scene')
    : 'No Scene Selected'

  return (
    <div className="mpx1-scene-panel">
      {error && (
        <div style={{ fontSize: 11, color: '#f87171', padding: '4px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: 4 }}>
          {error}
        </div>
      )}

      <div className="mpx1-scene-current">
        <div className="mpx1-scene-current__label">Current Scene</div>
        <div className="mpx1-scene-current__name" title={activeSceneName}>{activeSceneName}</div>
      </div>

      <div className="mpx1-scene-capture-row">
        <input
          className="mpx1-scene-capture-row__input"
          type="text"
          placeholder="Scene name…"
          value={captureName}
          onChange={(e) => setCaptureName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCapture() }}
          maxLength={128}
        />
        <button type="button" className="mpx1-scene-capture-row__btn" onClick={() => void handleCapture()}>
          Capture
        </button>
      </div>

      {scenes.length === 0 ? (
        <div className="mpx1-scene-empty">
          <span className="mpx1-scene-empty__icon">◻</span>
          <span>No scenes yet — capture the current state above</span>
        </div>
      ) : (
        <div className="mpx1-scene-grid">
          {scenes.map((scene) => (
            <SceneBtn
              key={scene.id}
              scene={scene}
              isActive={scene.id === activeSceneId}
              onRecall={handleRecall}
              onPress={handlePress}
              onRelease={handleRelease}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {scenes.length >= 2 && (
        <MorphStrip
          scenes={scenes}
          activeJobId={morphJobId}
          onMorphStart={handleMorphStart}
          onMorphCancel={handleMorphCancel}
        />
      )}
    </div>
  )
}
