import { Button, InlineLoading, Tag, Tile, Toggle } from '@carbon/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { MaschinePadLedChoreography } from './MaschinePadLedChoreography'
import { MaschinePhaseStrip } from './MaschinePhaseStrip'
import { maschineApi } from '../../../map2/clients/maschine'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
} from '../../../map2/types'

// T2522-D cycle 9 — Mapping Studio scaffold + drag-drop primitive.
//
// Two-pane layout:
//
//   Left  — parameter source list. Pulls from
//           status.audio_grid.blocks[].top_parameters: every chain
//           block in the active snapshot exposes its top-level
//           parameters as draggable cards. Card payload =
//           { block_id, param_id, label } — the same shape the
//           encoder-map already accepts.
//
//   Right — MK1 control surface as drop targets. Cycle 9 ships
//           encoders only (enc1-enc8 plus vol/tempo/swing), since
//           those flow through the existing
//           PUT /api/maschine/encoder-map route with no backend
//           change. Pads + buttons get their own binding model in
//           cycles 10-11 (LED choreography + State Authority
//           document.controllers.maschine_mk1).
//
// Working-copy state: edits stay local until "Save bindings" is
// clicked; the mutation PUTs the full encoder map. The unsaved-
// changes badge guides the operator across navigation.

const ENCODER_SLOTS = ['enc1', 'enc2', 'enc3', 'enc4', 'enc5', 'enc6', 'enc7', 'enc8', 'vol', 'tempo', 'swing'] as const
type EncoderSlot = (typeof ENCODER_SLOTS)[number]

interface DraggableParam {
  block_id: string
  param_id: string
  label: string
  /** Friendly source line ("Reverb / wet") used for tooltips. */
  display: string
}

interface MappingStudioProps {
  status: MaschineDaemonStatus | null
  encoderMap: MaschineEncoderMap | null
  refetchStatus: () => void
}

const DRAG_MIME = 'application/x-map2-maschine-binding'

function paramSources(status: MaschineDaemonStatus | null): DraggableParam[] {
  const out: DraggableParam[] = []
  for (const block of status?.audio_grid?.blocks ?? []) {
    const blockLabel = block.plugin_name ?? block.chain_name ?? `Block ${block.block_id}`
    for (const param of block.top_parameters ?? []) {
      const paramLabel = param.param_id
      out.push({
        block_id: block.block_id,
        param_id: param.param_id,
        label: paramLabel,
        display: `${blockLabel} / ${paramLabel}`,
      })
    }
  }
  return out
}

export function MaschineMappingStudio({ status, encoderMap, refetchStatus }: MappingStudioProps) {
  const queryClient = useQueryClient()
  const [workingMap, setWorkingMap] = useState<MaschineEncoderMap | null>(null)
  // T2522-D cycle 10 — SHIFT-layer view toggle. When on, the editor
  // works against `shift_enc1`...`shift_swing` keys instead of the
  // base layer. Save still sends the full map (both layers) so the
  // daemon can route at runtime based on the live SHIFT button state.
  const [shiftLayer, setShiftLayer] = useState(false)
  const slotKey = (slot: EncoderSlot): string => (shiftLayer ? `shift_${slot}` : slot)

  // Seed the working copy from the live encoder map. Re-seeding only
  // when a remote change actually lands keeps the operator's in-flight
  // edits intact across status polls.
  useEffect(() => {
    if (encoderMap && workingMap === null) {
      setWorkingMap(JSON.parse(JSON.stringify(encoderMap)) as MaschineEncoderMap)
    }
  }, [encoderMap, workingMap])

  const sources = useMemo(() => paramSources(status), [status])
  const isDirty = useMemo(() => {
    if (!workingMap || !encoderMap) return false
    return JSON.stringify(workingMap) !== JSON.stringify(encoderMap)
  }, [workingMap, encoderMap])

  const saveMutation = useMutation({
    mutationFn: (next: MaschineEncoderMap) =>
      maschineApi.updateEncoderMap(next as Record<string, unknown>),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'encoder-map'] })
      refetchStatus()
    },
  })

  const handleDragStart = (param: DraggableParam) => (event: React.DragEvent<HTMLLIElement>) => {
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(param))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>) => {
    if (event.dataTransfer.types.includes(DRAG_MIME)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (slot: EncoderSlot) => (event: React.DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    try {
      const param = JSON.parse(raw) as DraggableParam
      const key = slotKey(slot)
      setWorkingMap((prev) => {
        const base: MaschineEncoderMap = prev ? { ...prev } : {}
        base[key] = {
          block_id: param.block_id,
          param_id: param.param_id,
          label: param.display.length > 16 ? `${param.display.slice(0, 15)}…` : param.display,
          fixed: false,
        }
        return base
      })
    } catch {
      /* ignore malformed drops */
    }
  }

  const handleClear = (slot: EncoderSlot) => () => {
    const key = slotKey(slot)
    setWorkingMap((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      const existing = next[key]
      // Preserve fixed slots' existing entries — those are owned by the
      // daemon (vol = master gain, tempo = MIDI clock, etc.).
      if (existing?.fixed) return prev
      next[key] = null
      return next
    })
  }

  const handleSave = () => {
    if (!workingMap) return
    saveMutation.mutate(workingMap)
  }

  const handleRevert = () => {
    if (encoderMap) setWorkingMap(JSON.parse(JSON.stringify(encoderMap)) as MaschineEncoderMap)
  }

  const snapshotLabel = status?.audio_grid?.snapshot_name ?? 'No snapshot loaded'

  return (
    <div className="maschine-mapping">
      <Tile className="maschine-mapping__header">
        <div>
          <h3>Mapping Studio</h3>
          <p className="maschine-mapping__sub">
            Drag any chain-parameter card from the left onto an MK1 encoder slot. Bindings are scoped to the
            active snapshot. The SHIFT toggle scopes the editor to the secondary `shift_*` overlay; LED
            choreography (per-pad idle + press color) is below. State Authority phase-aware activation lands
            in cycle 11.
          </p>
        </div>
        <div className="maschine-mapping__header-actions">
          <Tag size="md" type="purple">{`Snapshot: ${snapshotLabel}`}</Tag>
          {shiftLayer ? <Tag size="md" type="cyan">SHIFT layer</Tag> : null}
          {isDirty ? <Tag size="md" type="magenta">Unsaved</Tag> : null}
          <Toggle
            id="mapping-shift-layer"
            size="sm"
            labelText="SHIFT overlay"
            labelA="Base layer"
            labelB="SHIFT layer"
            toggled={shiftLayer}
            onToggle={(checked) => setShiftLayer(checked)}
          />
          <Button kind="ghost" size="sm" onClick={handleRevert} disabled={!isDirty}>Revert</Button>
          {saveMutation.isPending ? (
            <InlineLoading description="Saving…" />
          ) : (
            <Button kind="primary" size="sm" onClick={handleSave} disabled={!isDirty || !workingMap}>
              Save bindings
            </Button>
          )}
        </div>
      </Tile>

      {saveMutation.isError ? (
        <Tile className="maschine-mapping__error">
          {(saveMutation.error as Error)?.message ?? 'Failed to save encoder map'}
        </Tile>
      ) : null}

      <MaschinePhaseStrip />

      <div className="maschine-mapping__panes">
        <Tile className="maschine-mapping__sources">
          <h4 className="maschine-mapping__pane-title">Parameter sources</h4>
          {sources.length === 0 ? (
            <p className="maschine-mapping__empty">
              No chain blocks mounted on the active snapshot. Mount blocks in the Snapshot Editor to
              expose parameters here.
            </p>
          ) : (
            <ul className="maschine-mapping__source-list">
              {sources.map((src) => (
                <li
                  key={`${src.block_id}::${src.param_id}`}
                  draggable
                  onDragStart={handleDragStart(src)}
                  className="maschine-mapping__source-card"
                  title={src.display}
                >
                  <span className="maschine-mapping__source-block">{src.display.split(' / ')[0]}</span>
                  <span className="maschine-mapping__source-param">{src.label}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile className="maschine-mapping__targets">
          <h4 className="maschine-mapping__pane-title">Encoder targets — drop to bind</h4>
          <ul className="maschine-mapping__target-list">
            {ENCODER_SLOTS.map((slot) => {
              const entry = workingMap?.[slotKey(slot)] ?? null
              const isFixed = entry?.fixed === true
              return (
                <li
                  key={slot}
                  className={`maschine-mapping__target${isFixed ? ' maschine-mapping__target--fixed' : ''}${entry && !isFixed ? ' maschine-mapping__target--bound' : ''}`}
                  onDragOver={isFixed ? undefined : handleDragOver}
                  onDrop={isFixed ? undefined : handleDrop(slot)}
                  data-encoder-slot={slot}
                >
                  <div className="maschine-mapping__target-head">
                    <span className="maschine-mapping__target-slot">{slot}</span>
                    {isFixed ? <Tag size="sm" type="cool-gray">Fixed</Tag> : null}
                  </div>
                  <div className="maschine-mapping__target-body">
                    {entry?.label ? (
                      <span className="maschine-mapping__target-label">{entry.label}</span>
                    ) : (
                      <span className="maschine-mapping__target-empty">Drop a parameter here</span>
                    )}
                    {entry?.block_id && entry.param_id ? (
                      <span className="maschine-mapping__target-meta">
                        {entry.block_id.slice(0, 8)} / {entry.param_id}
                      </span>
                    ) : null}
                  </div>
                  {entry && !isFixed ? (
                    <button
                      type="button"
                      className="maschine-mapping__target-clear"
                      onClick={handleClear(slot)}
                      aria-label={`Clear binding for ${slot}`}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="maschine-mapping__targets-help">
            SHIFT toggle in the header scopes the editor to the secondary <code>shift_*</code> overlay (cycle 10).
            Encoder bindings save through <code>PUT /api/maschine/encoder-map</code>; the daemon picks the right
            layer at runtime based on the live SHIFT button state.
          </p>
        </Tile>
      </div>

      <MaschinePadLedChoreography />
    </div>
  )
}
