import { useCallback, useEffect, useRef, useState } from 'react'

import { runStaggerOnRoot } from './UniversalStagger'
import { getStaggerTimings, type StaggerSpeed } from '../stores/effectsSettingsStore'
import './StaggerPreviewTile.css'

interface StaggerPreviewTileProps {
  speed: StaggerSpeed
  /** Forces a reduced-motion run regardless of the OS preference. */
  reduced?: boolean
}

const PREVIEW_TILE_LABELS = ['Channel A', 'Channel B', 'Channel C', 'Channel D', 'Channel E', 'Channel F']

/*
  Live preview of the React Staggered Reveal at the user-selected speed.
  Mirrors the universal animation so what the user sees here is what they
  get on every navigation. Click "Replay" to re-run after a speed change.
*/
export function StaggerPreviewTile({ speed, reduced = false }: StaggerPreviewTileProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const animationsRef = useRef<Animation[]>([])
  const [runCount, setRunCount] = useState(0)

  const runPreview = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    animationsRef.current.forEach((anim) => {
      try {
        anim.cancel()
      } catch {
        /* noop */
      }
    })
    const timings = getStaggerTimings(speed)
    animationsRef.current = runStaggerOnRoot(grid, `preview-${runCount}-${Date.now()}`, reduced, timings)
  }, [speed, reduced, runCount])

  useEffect(() => {
    runPreview()
    return () => {
      animationsRef.current.forEach((anim) => {
        try {
          anim.cancel()
        } catch {
          /* noop */
        }
      })
    }
  }, [runPreview])

  return (
    <div className="stagger-preview-tile">
      <div className="stagger-preview-tile__head">
        <span className="stagger-preview-tile__title">Live preview</span>
        {reduced ? (
          <span className="stagger-preview-tile__reduced-badge" data-testid="stagger-preview-reduced-badge">
            Reduced motion
          </span>
        ) : null}
        <button
          type="button"
          className="stagger-preview-tile__replay"
          onClick={() => setRunCount((count) => count + 1)}
          aria-label="Replay staggered reveal preview"
        >
          Replay
        </button>
      </div>
      <div ref={gridRef} className="stagger-preview-tile__grid" data-testid="stagger-preview-grid">
        {PREVIEW_TILE_LABELS.map((label) => (
          <div key={label} className="stagger-preview-tile__cell">
            <span className="stagger-preview-tile__cell-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
