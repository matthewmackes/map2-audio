import {
  Button,
  InlineLoading,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import {
  maschineApi,
  type MaschinePerformancePattern,
  type MaschinePerformancePatternsBank,
} from '../../../map2/clients/maschine'

// T2522-C cycle 7 — Step sequencer + scene strip.
//
// Operator surface for authoring 16-step performance patterns and
// promoting any pattern to a scene slot (one of the 8 group buttons
// A-H). Persistence is real: patterns round-trip through the
// calibration_facade → MaschineCalibrationStore on disk, so the
// bank survives reloads + restarts. Audio-rate playback through
// the engine wires in a later T2522-C-SEQ-PLAY follow-on; the bank
// is the operator authoring contract that will play back
// unchanged once that lands.
//
// UI:
//   • Header — pattern selector, pattern name TextInput, length
//     selector (1..16), scene slot selector (— or A-H), Save +
//     New + Delete + Set Active.
//   • Step grid — 16 rows × N columns. Click cycles 0 → 1 → 2 → 0
//     (empty / on / accented). Empty rows display dimmed.
//   • Scene strip — 8 cells A-H. Lit if a pattern is bound to that
//     slot. Clicking a bound cell sets it as the active pattern.

const PAD_COUNT = 16
const PAD_LABELS: string[] = Array.from({ length: PAD_COUNT }, (_, i) => `${i + 1}`)
const SCENE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

function emptyPattern(id: string, length = 16): MaschinePerformancePattern {
  return {
    id,
    name: `Pattern ${id.slice(0, 4)}`,
    length,
    steps: Array.from({ length: PAD_COUNT }, () => Array.from({ length }, () => 0)),
    scene_slot: null,
  }
}

function makeShortId(): string {
  // Random base-36 short id; suffix with timestamp for uniqueness in
  // tight succession.
  return `p${Math.random().toString(36).slice(2, 7)}${Date.now().toString(36).slice(-3)}`
}

function cycleStep(value: number): number {
  return (value + 1) % 3
}

function resizePattern(p: MaschinePerformancePattern, nextLength: number): MaschinePerformancePattern {
  const length = Math.max(1, Math.min(16, nextLength))
  const steps = p.steps.map((row) => {
    if (row.length === length) return [...row]
    if (row.length < length) return [...row, ...Array.from({ length: length - row.length }, () => 0)]
    return row.slice(0, length)
  })
  return { ...p, length, steps }
}

export function MaschineStepSequencer() {
  const queryClient = useQueryClient()
  const bankQuery = useQuery({
    queryKey: ['maschine', 'performance-patterns'],
    queryFn: () => maschineApi.getPerformancePatterns(),
    staleTime: 5_000,
  })
  const remoteBank = bankQuery.data?.performance_patterns ?? null

  const [workingBank, setWorkingBank] = useState<MaschinePerformancePatternsBank | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (remoteBank && workingBank === null) {
      setWorkingBank({
        active_pattern_id: remoteBank.active_pattern_id,
        patterns: remoteBank.patterns.map((p) => ({
          ...p,
          steps: p.steps.map((row) => [...row]),
        })),
      })
      setSelectedId(remoteBank.active_pattern_id ?? remoteBank.patterns[0]?.id ?? null)
    }
  }, [remoteBank, workingBank])

  const saveMutation = useMutation({
    mutationFn: (bank: MaschinePerformancePatternsBank) => maschineApi.updatePerformancePatterns(bank),
    onSuccess: (response) => {
      setWorkingBank({
        active_pattern_id: response.performance_patterns.active_pattern_id,
        patterns: response.performance_patterns.patterns.map((p) => ({
          ...p,
          steps: p.steps.map((row) => [...row]),
        })),
      })
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'performance-patterns'] })
    },
  })

  const isDirty = useMemo(() => {
    if (!workingBank || !remoteBank) return false
    return JSON.stringify(workingBank) !== JSON.stringify(remoteBank)
  }, [workingBank, remoteBank])

  const selectedPattern: MaschinePerformancePattern | null = useMemo(() => {
    if (!workingBank || !selectedId) return null
    return workingBank.patterns.find((p) => p.id === selectedId) ?? null
  }, [workingBank, selectedId])

  const updateSelectedPattern = (mutator: (p: MaschinePerformancePattern) => MaschinePerformancePattern) => {
    if (!workingBank || !selectedPattern) return
    setWorkingBank({
      ...workingBank,
      patterns: workingBank.patterns.map((p) => (p.id === selectedPattern.id ? mutator(p) : p)),
    })
  }

  const handleStepClick = (padIndex: number, stepIndex: number) => {
    updateSelectedPattern((p) => {
      const steps = p.steps.map((row) => [...row])
      steps[padIndex][stepIndex] = cycleStep(steps[padIndex][stepIndex])
      return { ...p, steps }
    })
  }

  const handleAddPattern = () => {
    if (!workingBank) return
    const id = makeShortId()
    const next = emptyPattern(id, 16)
    setWorkingBank({
      ...workingBank,
      patterns: [...workingBank.patterns, next],
    })
    setSelectedId(id)
  }

  const handleDeletePattern = () => {
    if (!workingBank || !selectedPattern) return
    const remaining = workingBank.patterns.filter((p) => p.id !== selectedPattern.id)
    const nextActive =
      workingBank.active_pattern_id === selectedPattern.id ? null : workingBank.active_pattern_id
    setWorkingBank({ active_pattern_id: nextActive, patterns: remaining })
    setSelectedId(remaining[0]?.id ?? null)
  }

  const handleSetActive = () => {
    if (!workingBank || !selectedPattern) return
    setWorkingBank({ ...workingBank, active_pattern_id: selectedPattern.id })
  }

  const handleSceneRecall = (slot: number) => {
    if (!workingBank) return
    const target = workingBank.patterns.find((p) => p.scene_slot === slot)
    if (!target) return
    setWorkingBank({ ...workingBank, active_pattern_id: target.id })
    setSelectedId(target.id)
  }

  const handleSave = () => {
    if (!workingBank) return
    saveMutation.mutate(workingBank)
  }

  const handleSceneSlotChange = (value: string) => {
    if (!selectedPattern || !workingBank) return
    const slot = value === '' ? null : Number(value)
    // Clear conflicting slot on any other pattern (server enforces
    // uniqueness; we mirror that here so the editor stays consistent
    // pre-save).
    setWorkingBank({
      ...workingBank,
      patterns: workingBank.patterns.map((p) => {
        if (p.id === selectedPattern.id) return { ...p, scene_slot: slot }
        if (slot !== null && p.scene_slot === slot) return { ...p, scene_slot: null }
        return p
      }),
    })
  }

  const isLoading = bankQuery.isLoading
  const errorMsg = bankQuery.isError
    ? (bankQuery.error as Error)?.message ?? 'Failed to load patterns'
    : saveMutation.isError
      ? (saveMutation.error as Error)?.message ?? 'Failed to save patterns'
      : null

  const sceneBindings: Map<number, MaschinePerformancePattern> = useMemo(() => {
    const map = new Map<number, MaschinePerformancePattern>()
    for (const p of workingBank?.patterns ?? []) {
      if (p.scene_slot !== null) map.set(p.scene_slot, p)
    }
    return map
  }, [workingBank])

  return (
    <Tile className="maschine-seq">
      <header className="maschine-seq__head">
        <div>
          <h4 className="maschine-perf__strip-title">Step sequencer + scenes</h4>
          <p className="maschine-curve-editor__sub">
            16-step pattern grid; one row per pad. Click any cell to cycle empty → on → accent. Promote a pattern to a
            scene by binding it to a group-button slot (A-H). Patterns persist through the calibration store; engine-side
            playback lands in T2522-C-SEQ-PLAY.
          </p>
        </div>
        <div className="maschine-seq__head-actions">
          {isDirty ? <Tag size="sm" type="magenta">Unsaved</Tag> : null}
          {saveMutation.isPending ? (
            <InlineLoading description="Saving…" />
          ) : (
            <Button kind="primary" size="sm" disabled={!isDirty} onClick={handleSave}>
              Save
            </Button>
          )}
        </div>
      </header>

      {errorMsg ? <p className="maschine-curve-editor__error">{errorMsg}</p> : null}

      {isLoading || !workingBank ? (
        <InlineLoading description="Loading patterns…" />
      ) : (
        <>
          <div className="maschine-seq__pattern-controls">
            <Select
              id="seq-pattern"
              labelText="Pattern"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
              size="sm"
            >
              <SelectItem value="" text={workingBank.patterns.length === 0 ? '(no patterns)' : '— pick —'} />
              {workingBank.patterns.map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  text={`${p.name}${p.id === workingBank.active_pattern_id ? ' ★' : ''}`}
                />
              ))}
            </Select>
            <Button kind="ghost" size="sm" onClick={handleAddPattern}>
              + New pattern
            </Button>
            {selectedPattern ? (
              <>
                <TextInput
                  id="seq-name"
                  size="sm"
                  labelText="Name"
                  value={selectedPattern.name}
                  onChange={(e) =>
                    updateSelectedPattern((p) => ({ ...p, name: e.target.value }))
                  }
                />
                <Select
                  id="seq-length"
                  labelText="Length"
                  size="sm"
                  value={String(selectedPattern.length)}
                  onChange={(e) =>
                    updateSelectedPattern((p) => resizePattern(p, Number(e.target.value)))
                  }
                >
                  {[4, 8, 12, 16].map((n) => (
                    <SelectItem key={n} value={String(n)} text={`${n} steps`} />
                  ))}
                </Select>
                <Select
                  id="seq-scene-slot"
                  labelText="Scene slot"
                  size="sm"
                  value={selectedPattern.scene_slot === null ? '' : String(selectedPattern.scene_slot)}
                  onChange={(e) => handleSceneSlotChange(e.target.value)}
                >
                  <SelectItem value="" text="— unbound —" />
                  {SCENE_LABELS.map((label, idx) => (
                    <SelectItem key={label} value={String(idx)} text={`Scene ${label}`} />
                  ))}
                </Select>
                <Button
                  kind="tertiary"
                  size="sm"
                  onClick={handleSetActive}
                  disabled={workingBank.active_pattern_id === selectedPattern.id}
                >
                  Set active
                </Button>
                <Button kind="danger--ghost" size="sm" onClick={handleDeletePattern}>
                  Delete pattern
                </Button>
              </>
            ) : null}
          </div>

          {selectedPattern ? (
            <div className="maschine-seq__grid-wrap">
              <div
                className="maschine-seq__grid"
                style={{ gridTemplateColumns: `auto repeat(${selectedPattern.length}, 1fr)` }}
              >
                {/* Header row of step indices */}
                <div className="maschine-seq__corner" />
                {Array.from({ length: selectedPattern.length }).map((_, stepIdx) => (
                  <div
                    key={`hdr-${stepIdx}`}
                    className={`maschine-seq__step-header${stepIdx % 4 === 0 ? ' maschine-seq__step-header--downbeat' : ''}`}
                  >
                    {stepIdx + 1}
                  </div>
                ))}
                {/* PAD rows */}
                {PAD_LABELS.map((padLabel, padIdx) => (
                  <PadRow
                    key={`row-${padIdx}`}
                    padIdx={padIdx}
                    padLabel={padLabel}
                    pattern={selectedPattern}
                    onStepClick={handleStepClick}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="maschine-seq__empty-state" data-testid="maschine-seq-empty-state">
              <p className="maschine-curve-editor__sub">
                No pattern selected. Click <strong>+ New pattern</strong> to start.
              </p>
              {/* T2522-E-F6 — bar marker row every 4 steps even when
                  no pattern is mounted, so the operator's eye lands
                  on the downbeat positions before authoring. */}
              <div
                className="maschine-seq__bar-marker"
                aria-label="16-step bar marker (downbeat highlight every 4 steps)"
              >
                {Array.from({ length: 16 }).map((_, stepIdx) => (
                  <span
                    key={`bar-${stepIdx}`}
                    className={`maschine-seq__bar-cell${stepIdx % 4 === 0 ? ' maschine-seq__bar-cell--downbeat' : ''}`}
                  >
                    {stepIdx + 1}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="maschine-seq__scene-strip">
            <h5 className="maschine-seq__scene-title">Scenes — recall by clicking a bound slot</h5>
            <div className="maschine-seq__scene-row">
              {SCENE_LABELS.map((label, idx) => {
                const bound = sceneBindings.get(idx)
                const isActive = bound !== undefined && bound.id === workingBank.active_pattern_id
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSceneRecall(idx)}
                    disabled={!bound}
                    className={[
                      'maschine-seq__scene-cell',
                      bound ? 'maschine-seq__scene-cell--bound' : '',
                      isActive ? 'maschine-seq__scene-cell--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={
                      bound
                        ? `Scene ${label} — recall pattern "${bound.name}"`
                        : `Scene ${label} — empty`
                    }
                  >
                    <span className="maschine-seq__scene-letter">{label}</span>
                    <span className="maschine-seq__scene-name">
                      {bound ? bound.name.slice(0, 12) : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </Tile>
  )
}

function PadRow({
  padIdx,
  padLabel,
  pattern,
  onStepClick,
}: {
  padIdx: number
  padLabel: string
  pattern: MaschinePerformancePattern
  onStepClick: (padIndex: number, stepIndex: number) => void
}) {
  const row = pattern.steps[padIdx] ?? []
  const isEmpty = row.every((cell) => cell === 0)
  return (
    <>
      <div className={`maschine-seq__row-label${isEmpty ? ' maschine-seq__row-label--empty' : ''}`}>
        {padLabel}
      </div>
      {row.map((cell, stepIdx) => (
        <button
          key={`step-${padIdx}-${stepIdx}`}
          type="button"
          className={[
            'maschine-seq__step',
            cell === 1 ? 'maschine-seq__step--on' : '',
            cell === 2 ? 'maschine-seq__step--accent' : '',
            stepIdx % 4 === 0 ? 'maschine-seq__step--downbeat' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onStepClick(padIdx, stepIdx)}
          aria-label={`Pad ${padIdx + 1} step ${stepIdx + 1}: ${
            cell === 0 ? 'empty' : cell === 1 ? 'on' : 'accent'
          }`}
        />
      ))}
    </>
  )
}
