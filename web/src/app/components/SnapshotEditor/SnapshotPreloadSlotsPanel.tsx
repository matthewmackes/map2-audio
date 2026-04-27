/**
 * T2454-G — Snapshot Preload Slots panel (pedalboard redesign).
 *
 * 5-column grid where each pinned snapshot is rendered as a "warming bay"
 * with a tiny pedalboard signal-chain preview. Replaces the prior vertical
 * row treatment and wires every action against real backend plumbing:
 *
 *   - Recall      → snapshotsApi.activate(id)
 *   - Lock toggle → snapshotsApi.update(id, { is_locked })
 *   - MIDI PC#    → snapshotsApi.setProgram(id, n | null)
 *   - Reload      → preloadOrchestrator.preload(id) (re-warm from disk)
 *   - Eject       → useSnapshotPreloadPins.unpin(id) (warm cache only;
 *                    confirms when slot is locked)
 *
 * State sources:
 *   useSnapshotPreloadPins   — pin order + cap (Special Settings, Raft-replicated)
 *   useSnapshotPreloadStatus — warm/cold dot per pin (5s poll on /preload-status)
 *   useSnapshotLive          — which snapshot is currently routing audio
 *   useSnapshotPinDetails    — per-pin SnapshotDetail (is_locked, program_number, chain[0].plugins)
 *
 * Accent / surface tokens come from the T2444 design language
 * (`--map2-accent-active*`, `--map2-accent-armed*`) and Carbon (`--cds-*`).
 */

import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Tag } from '@carbon/react'
import {
  Pin,
  Close,
  Add,
  Flash,
  Locked,
  Unlocked,
  Play,
  Renew,
  Music,
  Catalog,
} from '@carbon/icons-react'

import {
  SNAPSHOT_PRELOAD_PIN_LIMIT,
  useSnapshotPreloadPins,
} from '../../hooks/useSnapshotPreloadPins'
import { useSnapshotPreloadStatus } from '../../hooks/useSnapshotPreloadStatus'
import { useSnapshotLive } from '../../hooks/useSnapshotLive'
import { useSnapshotPinDetails } from '../../hooks/useSnapshotPinDetails'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { getEffectIcon } from '../icons/effectIcons'
import type { SnapshotDetail, SnapshotPlugin } from '../../../map2/types'

import './SnapshotPreloadSlotsPanel.css'

const SLOT_PEDAL_CAP = 5
const RAM_BUDGET_MB = 320 // shown in the panel header meta; matches the design

interface SnapshotPreloadSlotsPanelProps {
  snapshotNamesById: ReadonlyMap<number, string>
  selectedSnapshotId?: number | null
}

type SlotState = 'live' | 'warm' | 'warming' | 'cold' | 'empty'

interface SlotView {
  index: number
  snapshotId: number | null
  state: SlotState
  name: string
  detail: SnapshotDetail | undefined
  isLocked: boolean
  programNumber: number | null
  ramMb: number | null
  /** First chain's plugin list, capped at SLOT_PEDAL_CAP, used for the pedalboard preview. */
  pedalChain: SnapshotPlugin[]
}

function pickPedalChain(detail: SnapshotDetail | undefined): SnapshotPlugin[] {
  if (!detail?.chains?.length) return []
  // First non-empty chain; if all empty, return [].
  const chain = detail.chains.find((c) => c.plugins.length > 0) ?? detail.chains[0]
  return chain.plugins.slice(0, SLOT_PEDAL_CAP)
}

function ramFromStatusSlot(stagedInstanceCount: number | undefined): number | null {
  // Rough estimate: 7 MB per staged plugin instance. Real RAM accounting
  // belongs in the backend and lands in a future status-payload extension;
  // surface a number here so the design's RAM meter has data, with a clear
  // unit so the operator doesn't mistake it for authoritative.
  if (stagedInstanceCount == null) return null
  return Math.max(1, stagedInstanceCount * 7)
}

export function SnapshotPreloadSlotsPanel({
  snapshotNamesById,
  selectedSnapshotId,
}: SnapshotPreloadSlotsPanelProps) {
  const queryClient = useQueryClient()
  const { pins, isLoading: pinsLoading, error: pinsError, isCapReached, pin, unpin } =
    useSnapshotPreloadPins()
  const {
    status,
    isWarm,
    refetch: refetchStatus,
    preloadNow,
    isPreloading,
  } = useSnapshotPreloadStatus()
  const { liveSnapshotId } = useSnapshotLive()
  const { detailsById } = useSnapshotPinDetails(pins)

  const [warmingSnapshotId, setWarmingSnapshotId] = useState<number | null>(null)
  const [midiEditingId, setMidiEditingId] = useState<number | null>(null)
  const [midiDraft, setMidiDraft] = useState<string>('')
  const [confirmEjectId, setConfirmEjectId] = useState<number | null>(null)

  /** Map of snapshot_id → preload slot status payload (warm + staged_instance_count). */
  const statusSlotsBySnapshotId = useMemo(() => {
    const map = new Map<number, { warm: boolean; staged_instance_count: number }>()
    for (const slot of status?.slots ?? []) {
      map.set(slot.snapshot_id, {
        warm: slot.warm,
        staged_instance_count: slot.staged_instance_count,
      })
    }
    return map
  }, [status])

  const slots = useMemo<SlotView[]>(() => {
    const filled: SlotView[] = pins.map((snapshotId, index) => {
      const detail = detailsById.get(snapshotId)
      const warmEntry = statusSlotsBySnapshotId.get(snapshotId)
      const warm = warmEntry?.warm ?? false
      const isThisWarming = warmingSnapshotId === snapshotId
      const isThisLive = liveSnapshotId === snapshotId

      let state: SlotState
      if (isThisLive) state = 'live'
      else if (isThisWarming) state = 'warming'
      else if (warm) state = 'warm'
      else state = 'cold'

      return {
        index,
        snapshotId,
        state,
        name: detail?.name ?? snapshotNamesById.get(snapshotId) ?? `Snapshot ${snapshotId}`,
        detail,
        isLocked: Boolean(detail?.is_locked),
        programNumber: detail?.program_number ?? null,
        ramMb: ramFromStatusSlot(warmEntry?.staged_instance_count),
        pedalChain: pickPedalChain(detail),
      }
    })
    while (filled.length < SNAPSHOT_PRELOAD_PIN_LIMIT) {
      filled.push({
        index: filled.length,
        snapshotId: null,
        state: 'empty',
        name: '',
        detail: undefined,
        isLocked: false,
        programNumber: null,
        ramMb: null,
        pedalChain: [],
      })
    }
    return filled
  }, [
    pins,
    detailsById,
    statusSlotsBySnapshotId,
    warmingSnapshotId,
    liveSnapshotId,
    snapshotNamesById,
  ])

  const totalRamMb = useMemo(
    () => slots.reduce((sum, slot) => sum + (slot.ramMb ?? 0), 0),
    [slots],
  )

  const filledCount = pins.length

  const handleRecall = useCallback(
    async (snapshotId: number) => {
      try {
        await snapshotsApi.activate(snapshotId)
        await queryClient.invalidateQueries({ queryKey: ['snapshot-live'] })
        refetchStatus()
      } catch {
        // Activation errors surface through the editor's toast pipeline; the
        // panel intentionally stays quiet so it doesn't shout twice.
      }
    },
    [queryClient, refetchStatus],
  )

  const handleWarmNow = useCallback(
    async (snapshotId: number) => {
      setWarmingSnapshotId(snapshotId)
      try {
        await preloadNow(snapshotId)
      } catch {
        // ignore — reconciler retries
      } finally {
        setWarmingSnapshotId(null)
        refetchStatus()
      }
    },
    [preloadNow, refetchStatus],
  )

  const handleToggleLock = useCallback(
    async (snapshotId: number, nextLocked: boolean) => {
      try {
        await snapshotsApi.update(snapshotId, { is_locked: nextLocked })
        await queryClient.invalidateQueries({ queryKey: ['snapshot-detail', snapshotId] })
      } catch {
        // ignore — operator can retry via the icon
      }
    },
    [queryClient],
  )

  const commitMidi = useCallback(
    async (snapshotId: number, raw: string) => {
      const trimmed = raw.trim()
      // Empty input clears the binding.
      const nextProgram: number | null =
        trimmed === '' ? null : Math.max(0, Math.min(127, parseInt(trimmed, 10) || 0))
      try {
        await snapshotsApi.setProgram(snapshotId, nextProgram)
        await queryClient.invalidateQueries({ queryKey: ['snapshot-detail', snapshotId] })
      } catch {
        // ignore
      }
      setMidiEditingId(null)
      setMidiDraft('')
    },
    [queryClient],
  )

  const handleEjectClick = useCallback(
    (slot: SlotView) => {
      if (slot.snapshotId == null) return
      if (slot.isLocked) {
        setConfirmEjectId(slot.snapshotId)
        return
      }
      void unpin(slot.snapshotId).then(() => refetchStatus())
    },
    [unpin, refetchStatus],
  )

  const confirmEject = useCallback(async () => {
    if (confirmEjectId == null) return
    await unpin(confirmEjectId)
    refetchStatus()
    setConfirmEjectId(null)
  }, [confirmEjectId, unpin, refetchStatus])

  const handlePinSelected = useCallback(async () => {
    if (selectedSnapshotId == null) return
    const result = await pin(selectedSnapshotId)
    if (result.ok) {
      setWarmingSnapshotId(selectedSnapshotId)
      try {
        await preloadNow(selectedSnapshotId)
      } catch {
        // ignore
      } finally {
        setWarmingSnapshotId(null)
        refetchStatus()
      }
    }
  }, [selectedSnapshotId, pin, preloadNow, refetchStatus])

  const canPinSelected =
    selectedSnapshotId != null &&
    Number.isInteger(selectedSnapshotId) &&
    !pins.includes(selectedSnapshotId) &&
    !isCapReached

  const ramPct = Math.min(100, Math.round((totalRamMb / RAM_BUDGET_MB) * 100))

  return (
    <section
      className="snapshot-preload-slots"
      aria-label="Snapshot preload slots"
      data-loading={pinsLoading ? 'true' : 'false'}
    >
      <header className="snapshot-preload-slots__panel-head">
        <div className="snapshot-preload-slots__panel-head-left">
          <Pin size={14} aria-hidden className="snapshot-preload-slots__pin-icon" />
          <span className="snapshot-preload-slots__title">Preload Slots</span>
          <span className="snapshot-preload-slots__title-meta">
            snapshots warmed in RAM · ready for sub-millisecond recall
          </span>
        </div>
        <div className="snapshot-preload-slots__panel-head-right">
          <div className="snapshot-preload-slots__ram-meter" title="Estimated RAM held by warm cache">
            <span className="snapshot-preload-slots__ram-label">RAM</span>
            <span className="snapshot-preload-slots__ram-bar" aria-hidden>
              <i style={{ width: `${ramPct}%` }} />
            </span>
            <span className="snapshot-preload-slots__ram-value">
              <b>{totalRamMb}</b>/{RAM_BUDGET_MB} MB
            </span>
          </div>
          <Tag size="sm" type={isCapReached ? 'cyan' : 'gray'} className="snapshot-preload-slots__count-tag">
            {filledCount}/{SNAPSHOT_PRELOAD_PIN_LIMIT}
          </Tag>
        </div>
      </header>

      {pinsError ? (
        <p className="snapshot-preload-slots__error" role="alert">
          {pinsError}
        </p>
      ) : null}

      <ul className="snapshot-preload-slots__grid">
        {slots.map((slot) => {
          if (slot.snapshotId == null) {
            return (
              <li
                key={`slot-${slot.index}`}
                className="snapshot-preload-slots__slot snapshot-preload-slots__slot--empty"
              >
                <div className="snapshot-preload-slots__slot-head">
                  <span className="snapshot-preload-slots__numplate snapshot-preload-slots__numplate--empty">
                    {String(slot.index + 1).padStart(2, '0')}
                  </span>
                  <span className="snapshot-preload-slots__state-chip">
                    <span className="snapshot-preload-slots__led" data-state="empty" aria-hidden />
                    Empty
                  </span>
                </div>
                {canPinSelected && slot.index === pins.length ? (
                  <button
                    type="button"
                    className="snapshot-preload-slots__empty-cta"
                    onClick={() => void handlePinSelected()}
                  >
                    <span className="snapshot-preload-slots__empty-icon" aria-hidden>
                      <Add size={20} />
                    </span>
                    <span className="snapshot-preload-slots__empty-cta-label">Add selected</span>
                    <span className="snapshot-preload-slots__empty-hint">
                      Pin the snapshot loaded in the editor
                    </span>
                  </button>
                ) : (
                  <div className="snapshot-preload-slots__empty-rest">
                    <span className="snapshot-preload-slots__empty-icon" aria-hidden>
                      <Add size={20} />
                    </span>
                    <span className="snapshot-preload-slots__empty-placeholder">Empty slot</span>
                    <span className="snapshot-preload-slots__empty-hint">
                      Select a snapshot in the editor to pin
                    </span>
                  </div>
                )}
              </li>
            )
          }

          const stateLabel: Record<Exclude<SlotState, 'empty'>, string> = {
            live: 'On Air',
            warm: 'Ready',
            warming: 'Warming…',
            cold: 'Cold',
          }

          return (
            <li
              key={`slot-${slot.index}`}
              className={`snapshot-preload-slots__slot snapshot-preload-slots__slot--${slot.state}${
                slot.isLocked ? ' snapshot-preload-slots__slot--locked' : ''
              }`}
              data-warm={slot.state === 'warm' || slot.state === 'live' ? 'true' : 'false'}
              data-warming={slot.state === 'warming' ? 'true' : 'false'}
            >
              {/* Slot head — number plate, state chip, MIDI binding chip */}
              <div className="snapshot-preload-slots__slot-head">
                <span
                  className={`snapshot-preload-slots__numplate snapshot-preload-slots__numplate--${slot.state}`}
                >
                  {String(slot.index + 1).padStart(2, '0')}
                </span>
                <span className="snapshot-preload-slots__state-chip">
                  <span
                    className="snapshot-preload-slots__led"
                    data-state={slot.state}
                    aria-hidden
                  />
                  {stateLabel[slot.state as Exclude<SlotState, 'empty'>]}
                </span>
                {midiEditingId === slot.snapshotId ? (
                  <input
                    aria-label={`Edit MIDI program change for ${slot.name}`}
                    className="snapshot-preload-slots__midi-input"
                    autoFocus
                    value={midiDraft}
                    inputMode="numeric"
                    maxLength={3}
                    onChange={(e) => setMidiDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => slot.snapshotId != null && void commitMidi(slot.snapshotId, midiDraft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && slot.snapshotId != null) {
                        void commitMidi(slot.snapshotId, midiDraft)
                      } else if (e.key === 'Escape') {
                        setMidiEditingId(null)
                        setMidiDraft('')
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="snapshot-preload-slots__midi-chip"
                    aria-label={`Set MIDI Program Change for ${slot.name}`}
                    title="Click to set MIDI Program Change"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (slot.snapshotId == null) return
                      setMidiEditingId(slot.snapshotId)
                      setMidiDraft(
                        slot.programNumber != null ? String(slot.programNumber).padStart(2, '0') : '',
                      )
                    }}
                  >
                    <Music size={10} />
                    <span>PC</span>
                    <b>{slot.programNumber != null ? String(slot.programNumber).padStart(2, '0') : '—'}</b>
                  </button>
                )}
              </div>

              {/* Slot body — rig name, RAM/recall sub-line, pedalboard preview */}
              <div className="snapshot-preload-slots__slot-body">
                <div className="snapshot-preload-slots__rig-name" title={slot.name}>
                  {slot.name}
                  {slot.isLocked ? (
                    <span
                      className="snapshot-preload-slots__lock-tag"
                      title="Locked — eject will confirm"
                      aria-label="Locked"
                    >
                      <Locked size={11} />
                    </span>
                  ) : null}
                </div>
                <div className="snapshot-preload-slots__rig-sub">
                  <span>
                    <b>{slot.ramMb ?? '—'}</b> MB
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    recall{' '}
                    <b>
                      {slot.state === 'warming' || slot.state === 'cold'
                        ? '—'
                        : slot.state === 'live'
                        ? 'live'
                        : '<1 ms'}
                    </b>
                  </span>
                </div>

                <div className="snapshot-preload-slots__pedalboard">
                  <span className="snapshot-preload-slots__pb-label">signal chain</span>
                  <div className="snapshot-preload-slots__pedals">
                    {slot.pedalChain.length === 0 ? (
                      <span className="snapshot-preload-slots__pb-empty">No plugins staged</span>
                    ) : (
                      slot.pedalChain.map((plugin, idx) => {
                        const Icon = getEffectIcon(plugin.name ?? plugin.uri)
                        const on = !plugin.bypass
                        return (
                          <span
                            key={`${plugin.id ?? plugin.uri}-${idx}`}
                            className={`snapshot-preload-slots__pedal${
                              on ? '' : ' snapshot-preload-slots__pedal--off'
                            }`}
                            title={plugin.name ?? plugin.uri}
                          >
                            <span className="snapshot-preload-slots__pedal-led" aria-hidden />
                            <span className="snapshot-preload-slots__pedal-ico" aria-hidden>
                              <Icon />
                            </span>
                            <span className="snapshot-preload-slots__pedal-name">
                              {plugin.name ?? '—'}
                            </span>
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Slot foot — lock / reload / eject + Recall button */}
              <div className="snapshot-preload-slots__slot-foot">
                <div className="snapshot-preload-slots__foot-actions">
                  <button
                    type="button"
                    className={`snapshot-preload-slots__icon-btn${
                      slot.isLocked ? ' snapshot-preload-slots__icon-btn--active' : ''
                    }`}
                    aria-label={slot.isLocked ? `Unlock ${slot.name}` : `Lock ${slot.name}`}
                    title={slot.isLocked ? 'Unlock slot' : 'Lock slot'}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (slot.snapshotId == null) return
                      void handleToggleLock(slot.snapshotId, !slot.isLocked)
                    }}
                  >
                    {slot.isLocked ? <Locked /> : <Unlocked />}
                  </button>
                  <button
                    type="button"
                    className="snapshot-preload-slots__icon-btn"
                    aria-label={`Reload ${slot.name} from disk`}
                    title="Reload from disk (re-warm)"
                    disabled={isPreloading || slot.state === 'warming'}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (slot.snapshotId == null) return
                      void handleWarmNow(slot.snapshotId)
                    }}
                  >
                    <Renew />
                  </button>
                  <button
                    type="button"
                    className="snapshot-preload-slots__icon-btn"
                    aria-label={`Eject ${slot.name}`}
                    title={slot.isLocked ? 'Eject (will confirm — locked)' : 'Eject from RAM (unpin)'}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEjectClick(slot)
                    }}
                  >
                    <Close />
                  </button>
                </div>
                <div className="snapshot-preload-slots__foot-recall">
                  {slot.state === 'cold' ? (
                    <button
                      type="button"
                      className="snapshot-preload-slots__warm-btn"
                      aria-label={`Warm ${slot.name} now`}
                      title="Warm now"
                      disabled={isPreloading}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (slot.snapshotId == null) return
                        void handleWarmNow(slot.snapshotId)
                      }}
                    >
                      <Flash size={12} /> Warm
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`snapshot-preload-slots__recall-btn snapshot-preload-slots__recall-btn--${slot.state}`}
                    aria-label={
                      slot.state === 'live'
                        ? `${slot.name} is currently active`
                        : `Recall ${slot.name}`
                    }
                    disabled={
                      slot.state === 'live' || slot.state === 'warming' || slot.state === 'cold'
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (slot.snapshotId == null) return
                      void handleRecall(slot.snapshotId)
                    }}
                  >
                    <Play size={10} />
                    {slot.state === 'live'
                      ? 'Active'
                      : slot.state === 'warming'
                      ? 'Warming'
                      : slot.state === 'cold'
                      ? 'Cold'
                      : 'Recall'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <footer className="snapshot-preload-slots__library-hint">
        <span>
          {filledCount < SNAPSHOT_PRELOAD_PIN_LIMIT ? (
            <>
              <Catalog size={12} aria-hidden /> {SNAPSHOT_PRELOAD_PIN_LIMIT - filledCount} empty slot
              {SNAPSHOT_PRELOAD_PIN_LIMIT - filledCount === 1 ? '' : 's'} · pin from the snapshot library to preload
            </>
          ) : (
            <>
              <Catalog size={12} aria-hidden /> All preload slots full · unpin to free a bay
            </>
          )}
        </span>
      </footer>

      <Modal
        open={confirmEjectId != null}
        modalHeading="Eject locked snapshot?"
        modalLabel="Preload Slots"
        primaryButtonText="Eject"
        secondaryButtonText="Keep pinned"
        danger
        onRequestClose={() => setConfirmEjectId(null)}
        onRequestSubmit={() => void confirmEject()}
      >
        <p>
          This snapshot is marked locked. Ejecting will unpin it from the warm cache; the snapshot
          itself stays in the library.
        </p>
      </Modal>
    </section>
  )
}
