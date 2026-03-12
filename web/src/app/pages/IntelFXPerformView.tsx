/**
 * IntelFXPerformView - Scenes + morph panel for performance mode.
 *
 * Features:
 * - Scene list with capture/recall/delete
 * - Morph slider between two selected scenes
 * - Morph curve and duration controls
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Add, Flash, Renew, TrashCan } from '@carbon/icons-react'
import {
  Button,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from '@carbon/react'

import { useIntelFXPageContext } from './IntelFXPage'
import { mpx1Api, type MPX1MorphRequest, type MPX1Scene } from '../../map2/mpx1Api'
import { formatIntelFXProgramNumber } from '../components/IntelFX/programNumber'
import './IntelFXPerformView.css'

const MORPH_CURVES: Array<{ value: MPX1MorphRequest['curve']; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease_in', label: 'Ease in' },
  { value: 'ease_out', label: 'Ease out' },
  { value: 's_curve', label: 'S-curve' },
]

export function IntelFXPerformView() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [scenes, setScenes] = useState<MPX1Scene[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')
  const [morphSceneA, setMorphSceneA] = useState<string | null>(null)
  const [morphSceneB, setMorphSceneB] = useState<string | null>(null)
  const [morphDuration, setMorphDuration] = useState(2.0)
  const [morphCurve, setMorphCurve] = useState<MPX1MorphRequest['curve']>('linear')
  const [morphJobId, setMorphJobId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await mpx1Api.listScenes(nodeId)
      setScenes(data.scenes)
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

  const currentProgram = intelfx.state?.current_program ?? 0

  const handleCaptureScene = useCallback(async () => {
    if (!newSceneName.trim()) return
    try {
      const scene = await mpx1Api.captureScene(newSceneName.trim(), [], nodeId)
      setNewSceneName('')
      setLcdText(`SCENE CAPTURED: ${scene.name}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [newSceneName, nodeId, refresh, setLcdText])

  const handleRecallScene = useCallback(async (sceneId: string) => {
    try {
      const result = await mpx1Api.recallScene(sceneId, nodeId)
      setLcdText(`SCENE RECALLED: P${formatIntelFXProgramNumber(result.program)}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, refresh, setLcdText])

  const handleDeleteScene = useCallback(async (sceneId: string) => {
    try {
      await mpx1Api.deleteScene(sceneId, nodeId)
      setLcdText('SCENE DELETED')
      if (morphSceneA === sceneId) setMorphSceneA(null)
      if (morphSceneB === sceneId) setMorphSceneB(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [nodeId, refresh, setLcdText, morphSceneA, morphSceneB])

  const handleStartMorph = useCallback(async () => {
    if (!morphSceneA || !morphSceneB) return
    try {
      const result = await mpx1Api.startMorph({
        scene_id_a: morphSceneA,
        scene_id_b: morphSceneB,
        duration_sec: morphDuration,
        curve: morphCurve,
      }, nodeId)
      setMorphJobId(result.job_id)
      setLcdText(`MORPHING (${morphDuration}s, ${morphCurve})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [morphSceneA, morphSceneB, morphDuration, morphCurve, nodeId, setLcdText])

  const handleCancelMorph = useCallback(async () => {
    if (!morphJobId) return
    try {
      await mpx1Api.cancelMorph(morphJobId, nodeId)
      setMorphJobId(null)
      setLcdText('MORPH CANCELLED')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [morphJobId, nodeId, setLcdText])

  const sceneAName = scenes.find((scene) => scene.id === morphSceneA)?.name ?? '--'
  const sceneBName = scenes.find((scene) => scene.id === morphSceneB)?.name ?? '--'
  const canStartMorph = Boolean(morphSceneA && morphSceneB)

  const sceneSummary = useMemo(
    () => `${sceneAName} -> ${sceneBName} (${morphDuration}s, ${morphCurve})`,
    [sceneAName, sceneBName, morphDuration, morphCurve]
  )

  return (
    <div className="intelfx-perform-page">
      <Layer className="intelfx-perform-page__hero">
        <div className="intelfx-perform-page__hero-title-row">
          <Flash size={24} aria-hidden="true" className="intelfx-perform-page__hero-icon" />
          <div>
            <h2 className="intelfx-perform-page__title">Perform mode</h2>
            <p className="intelfx-perform-page__subtitle">Capture scenes and run morph transitions for live performance.</p>
          </div>
        </div>
      </Layer>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Scene workflow error"
          subtitle={error}
          className="intelfx-perform-page__error"
        />
      ) : null}

      <section className="intelfx-perform-page__section">
        <div className="intelfx-perform-page__capture-row">
          <TextInput
            id="intelfx-scene-capture-name"
            size="sm"
            hideLabel
            labelText="Scene name"
            value={newSceneName}
            placeholder={`Capture scene from P${formatIntelFXProgramNumber(currentProgram)}...`}
            className="intelfx-perform-page__capture-input"
            onChange={(event) => setNewSceneName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleCaptureScene()
              }
            }}
          />
          <Button
            size="sm"
            kind="primary"
            renderIcon={Add}
            onClick={() => void handleCaptureScene()}
            disabled={!newSceneName.trim()}
          >
            Capture scene
          </Button>
        </div>
      </section>

      <section className="intelfx-perform-page__section">
        <h3 className="intelfx-perform-page__section-title">
          <Flash size={16} aria-hidden="true" />
          Scene morph
        </h3>

        <div className="intelfx-perform-page__morph-grid">
          <Select
            id="intelfx-morph-scene-a"
            labelText="Scene A"
            size="sm"
            value={morphSceneA ?? ''}
            onChange={(event) => setMorphSceneA(event.currentTarget.value || null)}
          >
            <SelectItem value="" text="Select scene" />
            {scenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id} text={scene.name} />
            ))}
          </Select>

          <span className="intelfx-perform-page__morph-arrow" aria-hidden="true">
            {'->'}
          </span>

          <Select
            id="intelfx-morph-scene-b"
            labelText="Scene B"
            size="sm"
            value={morphSceneB ?? ''}
            onChange={(event) => setMorphSceneB(event.currentTarget.value || null)}
          >
            <SelectItem value="" text="Select scene" />
            {scenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id} text={scene.name} />
            ))}
          </Select>
        </div>

        <div className="intelfx-perform-page__morph-controls">
          <TextInput
            id="intelfx-morph-duration"
            size="sm"
            type="number"
            labelText="Duration (seconds)"
            value={String(morphDuration)}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value)
              if (Number.isFinite(nextValue)) {
                setMorphDuration(nextValue)
              }
            }}
          />

          <Select
            id="intelfx-morph-curve"
            labelText="Curve"
            size="sm"
            value={morphCurve}
            onChange={(event) => setMorphCurve(event.currentTarget.value as MPX1MorphRequest['curve'])}
          >
            {MORPH_CURVES.map((curve) => (
              <SelectItem key={curve.value} value={curve.value} text={curve.label} />
            ))}
          </Select>

          <div className="intelfx-perform-page__morph-action">
            {morphJobId ? (
              <Button size="sm" kind="danger" onClick={() => void handleCancelMorph()}>
                Cancel morph
              </Button>
            ) : (
              <Button
                size="sm"
                kind="primary"
                onClick={() => void handleStartMorph()}
                disabled={!canStartMorph}
              >
                Start morph
              </Button>
            )}
          </div>
        </div>

        <p className="intelfx-perform-page__morph-summary">{sceneSummary}</p>
      </section>

      <section className="intelfx-perform-page__section">
        <div className="intelfx-perform-page__section-header">
          <h3 className="intelfx-perform-page__section-title">Saved scenes ({scenes.length})</h3>
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Renew}
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {scenes.length === 0 && !isLoading ? (
          <p className="intelfx-perform-page__empty">No scenes captured yet. Use the capture field above.</p>
        ) : null}

        <div className="intelfx-perform-page__scene-list">
          {scenes.map((scene) => (
            <article key={scene.id} className="intelfx-perform-page__scene-card">
              <div className="intelfx-perform-page__scene-main">
                <h4 className="intelfx-perform-page__scene-name">{scene.name}</h4>
                <p className="intelfx-perform-page__scene-meta">
                  P{formatIntelFXProgramNumber(scene.program)} | {scene.param_count} params | {new Date(scene.created_at).toLocaleString()}
                </p>
                {scene.tags.length > 0 ? (
                  <div className="intelfx-perform-page__scene-tags">
                    {scene.tags.map((tag) => (
                      <Tag key={tag} type="gray">
                        {tag}
                      </Tag>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="intelfx-perform-page__scene-actions">
                <Button size="sm" kind="primary" onClick={() => void handleRecallScene(scene.id)}>
                  Recall
                </Button>
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  renderIcon={TrashCan}
                  onClick={() => void handleDeleteScene(scene.id)}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default IntelFXPerformView
