/**
 * MIDI Assignments — v2 Walkthrough surface.
 *
 * Implements the Claude Design "MIDI Assignments · Walkthrough" mock with full
 * wiring to the MAP2 backend. The legacy 5-tab v1 page lives intact inside an
 * Advanced drawer (LegacyMidiAssignments component). Both surfaces share the
 * same React Query cache so changes show up everywhere.
 *
 * Decisions captured during Q&A (see chat for rationale):
 *  Q1 Walkthrough is default; v1 lives in Advanced drawer
 *  Q2 Pinned surface via localStorage 'map2.pinnedSurfaceId'
 *  Q3 Hybrid surface adapter (registry + walkthroughSurfaceMeta overlay)
 *  Q4 Listen subscribes to `midi_activity` WebSocket topic
 *  Q5 All four target categories live: pluginsApi.getAll, MIDIActionType, routing modes, /v2/engine/parameters
 *  Q6 Per-category Calibrate variant, auto-promote to ExpressionAssignment for Custom curve / deadzones
 *  Q7 Hybrid Test: client-side preview + opt-in "Send to engine"
 *  Q8 Hybrid lite Save: conflict warn + per-chain default scope when launched from snapshot
 *  Q9 LiveMidiStrip toggleable + filtered to active surface
 *  Q10 No Tweaks panel; accent follows surface; keyboard shortcuts implemented
 */

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Close, Music } from '@carbon/icons-react'

import {
  chainsApi,
  midiApiV2,
  pluginsApi,
} from '../../map2/api'
import { sequencerApi } from '../../map2/clients/sequencer'
import { fetchJson } from '../../map2/http'
import { API_BASE } from '../../map2/transport'
import type {
  Chain,
  MIDIActionType,
  MIDICommand,
  MIDICurveType,
  MIDIMappingV2,
  MIDIRoutingRule,
  MIDITriggerType,
  Plugin,
  RoutingMode,
} from '../../map2/types'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { LegacyMidiAssignments } from './midiAssignments/LegacyMidiAssignments'
import { ControllerSchematic, type ControlGuess } from './midiAssignments/ControllerSchematic'
import { LiveMidiStrip, type MidiMessage } from './midiAssignments/LiveMidiStrip'
import {
  GENERIC_SURFACE_META,
  WALKTHROUGH_SURFACE_META,
  hexToRgba,
  type WalkthroughSurfaceMeta,
} from './midiAssignments/walkthroughSurfaceMeta'
import { pinDevice, unpinDevice, usePinnedDevices } from '../state/uiSettings'

import './midiAssignments/walkthrough.css'

// ─── Step plan ──────────────────────────────────────────────────────────────
type StepId = 'device' | 'source' | 'target' | 'calibrate' | 'test' | 'save'

const STEPS: Array<{ id: StepId; title: string; sub: string }> = [
  { id: 'device', title: 'Surface', sub: '01 · pick or pin' },
  { id: 'source', title: 'Source', sub: '02 · cc / note / pc' },
  { id: 'target', title: 'Target', sub: '03 · param or command' },
  { id: 'calibrate', title: 'Calibrate', sub: '04 · curve & range' },
  { id: 'test', title: 'Test', sub: '05 · heel · live · toe' },
  { id: 'save', title: 'Save', sub: '06 · commit binding' },
]

// ─── Surface adapter (Q3) ───────────────────────────────────────────────────
interface AdaptedSurface {
  id: string
  label: string
  shortLabel: string
  status: 'online' | 'detected' | 'planned'
  capabilities: string[]
  meta: WalkthroughSurfaceMeta | null
}

function statusFromEnriched(status: string | undefined): AdaptedSurface['status'] {
  if (status === 'online' || status === 'available' || status === 'connected') return 'online'
  if (status === 'detected' || status === 'pending' || status === 'discovered') return 'detected'
  return 'planned'
}

function fallbackLabel(id: string): string {
  return id.split(/[-_]/g).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

interface EnrichedSurfaceSummary {
  units?: Array<{ unit_id: string; display_name?: string; status?: string; capabilities?: string[] }>
}

/**
 * T2461-A1 — merge Hardware Store pinned profile keys into the surface
 * picker as synthetic AdaptedSurface entries at the top of the list.
 * profile_key shape is `<pack_id>/<model>.<kind>`.
 */
export function mergeBenchPinsIntoSurfaces(
  baseSurfaces: AdaptedSurface[],
  pinnedProfileKeys: string[],
): AdaptedSurface[] {
  if (pinnedProfileKeys.length === 0) return baseSurfaces
  const existingIds = new Set(baseSurfaces.map((s) => s.id))
  const synthetic: AdaptedSurface[] = []
  for (const key of pinnedProfileKeys) {
    const slash = key.indexOf('/')
    if (slash < 0) continue
    const dotted = key.slice(slash + 1)
    const lastDot = dotted.lastIndexOf('.')
    const model = lastDot > 0 ? dotted.slice(0, lastDot) : dotted
    const kind = lastDot > 0 ? dotted.slice(lastDot + 1) : 'midi'
    const synId = `bench-pin:${key}`
    if (existingIds.has(synId)) continue
    synthetic.push({
      id: synId,
      label: `${model} (Hardware Store pin)`,
      shortLabel: model,
      status: 'online',
      capabilities: [`${kind} bindings`, 'pinned in Hardware Store'],
      meta: null,
    })
  }
  return [...synthetic, ...baseSurfaces]
}

function buildAdaptedSurfaces(summary: EnrichedSurfaceSummary | null | undefined): AdaptedSurface[] {
  const units = summary?.units ?? []
  // Always include the metadata-only surfaces (e.g. Push) so the picker matches the design.
  const seen = new Set<string>()
  const result: AdaptedSurface[] = []
  for (const u of units) {
    const meta = WALKTHROUGH_SURFACE_META[u.unit_id] ?? null
    seen.add(u.unit_id)
    result.push({
      id: u.unit_id,
      label: u.display_name ?? meta?.shortLabel ?? fallbackLabel(u.unit_id),
      shortLabel: meta?.shortLabel ?? u.display_name?.split(/\s+/g)[0] ?? fallbackLabel(u.unit_id),
      status: statusFromEnriched(u.status),
      capabilities: u.capabilities ?? meta?.capabilities ?? [],
      meta,
    })
  }
  for (const id of Object.keys(WALKTHROUGH_SURFACE_META)) {
    if (seen.has(id)) continue
    const meta = WALKTHROUGH_SURFACE_META[id]
    result.push({
      id,
      label: meta.shortLabel,
      shortLabel: meta.shortLabel,
      status: 'planned',
      capabilities: meta.capabilities,
      meta,
    })
  }
  return result
}

// ─── Pinned surface handshake (Q2) ──────────────────────────────────────────
//
// We piggyback on the existing `usePinnedDevices()` system (state/uiSettings.ts).
// The Devices page's Pin/Unpin button already writes to `map2.ui.settings`; we read
// the *first* entry there as the wizard's "default surface". No new keys needed.
function usePinnedSurfaceId(): [string | null, (id: string | null) => void] {
  const pinnedIds = usePinnedDevices()
  const pinnedId = pinnedIds[0] ?? null
  const setter = useCallback((id: string | null) => {
    if (!id) {
      // Unpin whatever was previously the "default" — preserves any other pinned items.
      if (pinnedId) unpinDevice(pinnedId)
      return
    }
    // Pin (re-pinning is a no-op in the existing helper).
    pinDevice(id)
  }, [pinnedId])
  return [pinnedId, setter]
}

// ─── Wizard state ───────────────────────────────────────────────────────────
type SourceKind = 'cc' | 'note' | 'pc'

interface WizardSource {
  kind: SourceKind
  cc?: number
  note?: number
  pc?: number
  ch: number
}

// T2461-A4 — `brain-action` joins the locked four target categories.
type TargetCategory = 'plugin-parameter' | 'snapshot-trigger' | 'routing-rule' | 'engine-performance' | 'brain-action'

interface PluginParamTarget {
  cat: 'plugin-parameter'
  id: string
  name: string
  path: string
  pluginUri: string
  paramIndex: number
  paramSymbol: string
  range: [number, number]
  unit: string
}

interface SnapshotTriggerTarget {
  cat: 'snapshot-trigger'
  id: string
  name: string
  path: string
  action: MIDIActionType
}

interface RoutingTarget {
  cat: 'routing-rule'
  id: string
  name: string
  path: string
  toMode: RoutingMode
}

interface EnginePerformanceTarget {
  cat: 'engine-performance'
  id: string
  name: string
  path: string
  paramId: string
  range: [number, number]
  unit: string
}

// T2461-A4 — Brain action target. Each row carries the dotted action
// id the binding writer accepts directly (e.g. `brain.transport.play`).
interface SequencerActionTarget {
  cat: 'brain-action'
  id: string
  name: string
  path: string
  brainKind: 'transport' | 'section' | 'slot' | 'layer'
  valueType: 'trigger' | 'toggle' | 'continuous'
}

type WizardTarget = PluginParamTarget | SnapshotTriggerTarget | RoutingTarget | EnginePerformanceTarget | SequencerActionTarget

type CurveName = 'Linear' | 'Exp' | 'Log' | 'S-curve' | 'Custom'

interface WizardCalibration {
  name: string
  group: string | null
  minIn: number
  maxIn: number
  minOut: number
  maxOut: number
  curve: CurveName
  invert: boolean
  deadzoneL: number
  deadzoneH: number
  feedback: boolean
  enabled: boolean
  /** Trigger-only: velocity/value threshold gate. */
  threshold: number
  /** Routing-only: from-flow index. */
  fromFlow: number
  /** Routing-only: to-flow index. */
  toFlow: number
  /** Per-chain or global. Defaults global; auto-defaults per-chain when launched from snapshot. */
  scope: 'global' | 'chain'
}

interface WizardState {
  surface: AdaptedSurface | null
  sourceMode: 'learn' | 'manual'
  listening: boolean
  source: WizardSource | null
  target: WizardTarget | null
  calibration: WizardCalibration | null
  activeControl: string | null
  channel: number
}

const DEFAULT_CALIBRATION: WizardCalibration = {
  name: 'New mapping',
  group: null,
  minIn: 0,
  maxIn: 127,
  minOut: 0,
  maxOut: 127,
  curve: 'Linear',
  invert: false,
  deadzoneL: 0,
  deadzoneH: 0,
  feedback: true,
  enabled: true,
  threshold: 64,
  fromFlow: 0,
  toFlow: 1,
  scope: 'global',
}

// ─── Curve preview SVG ──────────────────────────────────────────────────────
function CurveSvg({ curve, invert }: { curve: CurveName; invert: boolean }) {
  const pts: Array<[number, number]> = []
  const N = 60
  for (let i = 0; i <= N; i++) {
    const x = i / N
    let y: number
    if (curve === 'Exp') y = x * x
    else if (curve === 'Log') y = Math.sqrt(x)
    else if (curve === 'S-curve') y = 0.5 - 0.5 * Math.cos(Math.PI * x)
    else if (curve === 'Custom') y = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
    else y = x
    if (invert) y = 1 - y
    pts.push([x * 380 + 10, 190 - y * 180])
  }
  const d = 'M ' + pts.map((p) => p.join(',')).join(' L ')
  return (
    <svg className="curve-svg" viewBox="0 0 400 200" preserveAspectRatio="none">
      <defs>
        <linearGradient id="midi-walk-cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mw-accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--mw-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`h-${i}`} x1="10" x2="390" y1={10 + i * 45} y2={10 + i * 45} stroke="var(--mw-line)" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`v-${i}`} y1="10" y2="190" x1={10 + i * 95} x2={10 + i * 95} stroke="var(--mw-line)" />
      ))}
      <path d={d + ` L 390,190 L 10,190 Z`} fill="url(#midi-walk-cg)" />
      <path d={d} stroke="var(--mw-accent)" strokeWidth="2" fill="none" />
      <text x="10" y="200" fontSize="9" fill="var(--mw-text-4)">in 0</text>
      <text x="370" y="200" fontSize="9" fill="var(--mw-text-4)">127</text>
      <text x="10" y="20" fontSize="9" fill="var(--mw-text-4)">out</text>
    </svg>
  )
}

// ─── Step components ────────────────────────────────────────────────────────
function StepDevice({
  surfaces,
  state,
  setState,
  pinnedId,
  onPin,
  onContinue,
}: {
  surfaces: AdaptedSurface[]
  state: WizardState
  setState: (next: Partial<WizardState>) => void
  pinnedId: string | null
  onPin: (id: string | null) => void
  onContinue: () => void
}) {
  const pinned = surfaces.find((s) => s.id === pinnedId) ?? null
  return (
    <div>
      <div className="crumb"><span className="step-n">Step 01</span> · Choose your control surface</div>
      <h1>Which surface are we mapping today?</h1>
      <p className="lede">
        Pick a control surface from your registry. Pinning it sets it as the default for every walkthrough.
        The schematic, capability set, and accent color follow your choice through the rest of the steps.
      </p>

      {pinned && pinned.status === 'online' && state.surface?.id !== pinned.id && (
        <div
          className="pinned-hero"
          style={{
            ['--mw-accent' as string]: pinned.meta?.color ?? GENERIC_SURFACE_META.color,
            ['--mw-accent-soft' as string]: hexToRgba(pinned.meta?.color, 0.18),
            ['--mw-accent-line' as string]: hexToRgba(pinned.meta?.color, 0.35),
          } as React.CSSProperties}
        >
          <div className="iconbig" style={{ background: pinned.meta?.color ?? GENERIC_SURFACE_META.color }}>
            {pinned.shortLabel.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <div className="badge" style={{ background: pinned.meta?.color ?? GENERIC_SURFACE_META.color }}>
              Pinned from Devices
            </div>
            <h2>{pinned.label}</h2>
            <div className="meta">
              status <b style={{ color: 'var(--mw-engine)' }}>{pinned.status}</b> · {pinned.capabilities.length} capabilities
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              className="btn"
              style={{ background: pinned.meta?.color ?? GENERIC_SURFACE_META.color }}
              onClick={() => { setState({ surface: pinned }); onContinue() }}
            >
              Continue with {pinned.shortLabel} →
            </button>
            <button className="btn ghost" onClick={() => onPin(null)}>Unpin · pick another</button>
          </div>
        </div>
      )}

      <div className="devicegrid">
        {surfaces.map((s) => {
          const color = s.meta?.color ?? GENERIC_SURFACE_META.color
          return (
            <div
              key={s.id}
              className={`dcard ${state.surface?.id === s.id ? 'selected' : ''}`}
              style={{ ['--dcolor' as string]: color } as React.CSSProperties}
              onClick={() => setState({ surface: s })}
            >
              {pinnedId === s.id && <div className="pin">Pinned</div>}
              <div className="top">
                <div>
                  <div className="name">{s.label}</div>
                  <div className="sub">{s.meta?.eyebrow ?? s.id}</div>
                </div>
                <div className="icon" style={{ background: color }}>
                  {s.shortLabel.slice(0, 3).toUpperCase()}
                </div>
              </div>
              <div className="caps">
                {(s.capabilities ?? []).slice(0, 4).map((c) => <span key={c}>{c}</span>)}
              </div>
              <div className={`status ${s.status}`}>{s.status}</div>
              {state.surface?.id === s.id && pinnedId !== s.id && (
                <button
                  className="btn ghost"
                  style={{
                    // carbon-allow: dense pin button 6x10px (between Carbon stops).
                    padding: '6px 10px',
                    fontSize: 11,
                  }}
                  onClick={(e) => { e.stopPropagation(); onPin(s.id) }}
                >
                  Pin as default
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const COMMON_CC_NAMES: Record<number, string> = {
  1: 'Mod Wheel', 2: 'Breath', 4: 'Foot Controller', 7: 'Volume', 10: 'Pan',
  11: 'Expression', 64: 'Sustain', 65: 'Portamento', 71: 'Resonance', 74: 'Brightness',
  16: 'GP1', 17: 'GP2', 18: 'GP3', 19: 'GP4',
  20: 'General 1', 21: 'General 2', 22: 'General 3', 23: 'General 4',
}

function StepSource({
  state,
  setState,
}: {
  state: WizardState
  setState: (next: Partial<WizardState>) => void
}) {
  const surface = state.surface
  const mode = state.sourceMode
  const captured = state.source

  const handlePick = useCallback((controlId: string, guess: ControlGuess) => {
    const ch = state.channel || 1
    if (guess.kind === 'cc') {
      setState({ source: { kind: 'cc', cc: guess.value, ch }, activeControl: controlId, listening: false })
    } else if (guess.kind === 'note') {
      setState({ source: { kind: 'note', note: guess.value, ch }, activeControl: controlId, listening: false })
    } else if (guess.kind === 'pc') {
      setState({ source: { kind: 'pc', pc: guess.value, ch }, activeControl: controlId, listening: false })
    }
  }, [setState, state.channel])

  return (
    <div>
      <div className="crumb"><span className="step-n">Step 02</span> · Choose the trigger</div>
      <h1>Move it, or pick from the list.</h1>
      <p className="lede">
        Both paths land in the same place — a CC, Note, or PC binding scoped to a channel.
        Listen will lock onto the next inbound message and capture exactly what {surface?.shortLabel ?? 'your surface'} sends.
      </p>

      <div className="source-modes">
        <div
          className={`source-mode ${mode === 'learn' ? 'active' : ''}`}
          onClick={() => setState({ sourceMode: 'learn' })}
        >
          <div className="lbl">Mode A · Wiggle</div>
          <div className="ttl">Move the control</div>
          <div className="desc">Click Listen, then move the pad / knob / pedal you want to bind.</div>
        </div>
        <div
          className={`source-mode ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setState({ sourceMode: 'manual' })}
        >
          <div className="lbl">Mode B · Manual</div>
          <div className="ttl">Pick from the list</div>
          <div className="desc">Choose a CC, Note, or PC + channel directly — useful for surfaces that aren't connected.</div>
        </div>
      </div>

      {mode === 'learn' ? (
        <>
          <div className={`learn-box ${state.listening ? 'listening' : 'idle'}`}>
            <div className="big">
              {state.listening ? 'Listening…' : captured ? 'Captured' : 'Press Listen, then move the control'}
            </div>
            {captured ? (
              <div className="captured engine">
                {captured.kind === 'cc' && <><span className="lbl">CC </span>{captured.cc}<span className="lbl"> · ch </span>{captured.ch}<span className="lbl"> · </span>{COMMON_CC_NAMES[captured.cc!] ?? `CC ${captured.cc}`}</>}
                {captured.kind === 'note' && <><span className="lbl">Note </span>{captured.note}<span className="lbl"> · ch </span>{captured.ch}</>}
                {captured.kind === 'pc' && <><span className="lbl">PC </span>{captured.pc}<span className="lbl"> · ch </span>{captured.ch}</>}
              </div>
            ) : (
              <div className="captured">
                <span className="lbl">waiting for surface motion…</span>
              </div>
            )}
            <div className="row-flex" style={{ justifyContent: 'center', marginTop: 8 }}>
              {!state.listening ? (
                <button className="btn" onClick={() => setState({ listening: true })}>● Listen for next message</button>
              ) : (
                <button className="btn danger" onClick={() => setState({ listening: false })}>Cancel</button>
              )}
              {captured && (
                <button className="btn ghost" onClick={() => setState({ source: null, activeControl: null })}>Clear</button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-h">Or click on the schematic</div>
            <ControllerSchematic
              schematic={surface?.meta?.schematic ?? GENERIC_SURFACE_META.schematic}
              activeId={state.activeControl}
              targetId={state.listening ? null : null}
              onPick={handlePick}
            />
          </div>
        </>
      ) : (
        <ManualSourcePicker state={state} setState={setState} />
      )}
    </div>
  )
}

function ManualSourcePicker({
  state,
  setState,
}: {
  state: WizardState
  setState: (next: Partial<WizardState>) => void
}) {
  const [kind, setKind] = useState<SourceKind>(state.source?.kind ?? 'cc')
  const [ch, setCh] = useState<number>(state.source?.ch ?? 1)
  const [v, setV] = useState<number>(state.source?.cc ?? state.source?.note ?? state.source?.pc ?? 1)

  useEffect(() => {
    const src: WizardSource = kind === 'cc'
      ? { kind: 'cc', cc: v, ch }
      : kind === 'note'
        ? { kind: 'note', note: v, ch }
        : { kind: 'pc', pc: v, ch }
    setState({ source: src })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, ch, v])

  return (
    <div className="card">
      <div className="hd">
        Manual binding
        <div className="right">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SourceKind)}
            style={{ background: 'var(--mw-bg)', border: '1px solid var(--mw-line-2)', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', fontFamily: 'var(--mw-mono)' }}
          >
            <option value="cc">Control Change</option>
            <option value="note">Note</option>
            <option value="pc">Program Change</option>
          </select>
        </div>
      </div>
      <div className="body">
        <div className="field">
          <div className="lbl">Channel</div>
          <select value={ch} onChange={(e) => setCh(Number(e.target.value))}>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Ch {n}</option>)}
            <option value={0}>Omni (any)</option>
          </select>
        </div>
        <div className="field">
          <div className="lbl">{kind === 'cc' ? 'CC #' : kind === 'note' ? 'Note #' : 'PC #'}</div>
          <input type="number" min="0" max="127" value={v} onChange={(e) => setV(Number(e.target.value))} />
        </div>

        {kind === 'cc' && (
          <>
            <hr className="thin" />
            <div className="section-h">Common controllers</div>
            <div className="cclist">
              {Object.entries(COMMON_CC_NAMES).map(([n, name]) => (
                <div
                  key={n}
                  className={`ccrow ${Number(n) === v ? 'selected' : ''}`}
                  onClick={() => setV(Number(n))}
                >
                  <div className="num">CC {n}</div>
                  <div className="ch">ch {ch}</div>
                  <div className="name">{name}</div>
                  <div className="recent">●</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface EngineParam {
  id: string
  label: string
  min: number
  max: number
  unit?: string
  group?: string
}

const ROUTING_MODE_LABELS: Record<RoutingMode, string> = {
  parallel_blend: 'Parallel blend',
  series: 'Series',
  morph: 'Morph',
  sidechain: 'Sidechain',
  ab_switch: 'A/B switch',
}

// T2461-A8 — parse a Mixxx-shorthand into (group, key). Returns null
// when the query isn't of the form `[Group].key`.
export function parseMixxxShorthand(query: string): { group: string; key: string } | null {
  const m = /^\s*(\[[^\]]+\])\.(\w+)\s*$/.exec(query)
  if (!m) return null
  return { group: m[1], key: m[2] }
}

// T2461-A8 — extract the (pack_id, model, kind) tuple from a synthetic
// bench-pin AdaptedSurface id (`bench-pin:<pack>/<model>.<kind>`).
export function parseBenchPinSurfaceId(
  id: string,
): { packId: string; model: string; kind: 'midi' | 'hid' } | null {
  if (!id.startsWith('bench-pin:')) return null
  const profileKey = id.slice('bench-pin:'.length)
  const slash = profileKey.indexOf('/')
  if (slash < 0) return null
  const packId = profileKey.slice(0, slash)
  const dotted = profileKey.slice(slash + 1)
  const lastDot = dotted.lastIndexOf('.')
  const model = lastDot > 0 ? dotted.slice(0, lastDot) : dotted
  const kindRaw = lastDot > 0 ? dotted.slice(lastDot + 1) : 'midi'
  const kind = kindRaw === 'hid' ? 'hid' : 'midi'
  return { packId, model, kind }
}

// T2461-A6 — render a Brain capture frame stream into a small SVG
// waveform. Uses the peak_db track only (rms is similar shape, so
// the second polyline would be visually redundant at this size).
export function buildSequencerCaptureWaveformPath(
  frames: Array<{ peak_db: number; ts: number }>,
  startedAt: number,
  durationS: number,
  width: number,
  height: number,
  floorDb = -60,
): string {
  if (frames.length === 0 || durationS <= 0 || width <= 0 || height <= 0) {
    return ''
  }
  const ceilingDb = 0
  const dbRange = ceilingDb - floorDb
  const points = frames.map((f) => {
    const t = Math.max(0, Math.min(1, (f.ts - startedAt) / durationS))
    const db = Math.max(floorDb, Math.min(ceilingDb, f.peak_db))
    const norm = (db - floorDb) / dbRange   // 0..1, floor=0, ceiling=1
    const x = t * width
    const y = height - norm * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${points.join(' L ')}`
}

interface MixxxAliasPreviewProps {
  query: string
  surface: AdaptedSurface | null
  selectedTargetId: string | null
  onApply: (target: EnginePerformanceTarget) => void
}

// T2461-A8 — synthesise an EnginePerformanceTarget from a resolved Mixxx
// alias. The wizard already understands engine-parameter addresses as
// the "engine-performance" target category, so the resolved address
// lands in the same category and the rest of the wizard (calibrate,
// save) treats it identically.
export function buildMixxxAliasTarget(resolvedAddress: string): EnginePerformanceTarget {
  return {
    cat: 'engine-performance',
    id: `mixxx-alias::${resolvedAddress}`,
    name: resolvedAddress,
    path: resolvedAddress,
    paramId: resolvedAddress,
    range: [0, 1],
    unit: '',
  }
}

function MixxxAliasPreview({ query, surface, selectedTargetId, onApply }: MixxxAliasPreviewProps): React.JSX.Element | null {
  const shorthand = parseMixxxShorthand(query)
  const benchPin = surface ? parseBenchPinSurfaceId(surface.id) : null

  const [resolved, setResolved] = useState<{ target: string; aliasUsed: boolean } | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!shorthand || !benchPin) {
      setResolved(null)
      setReason(null)
      return
    }
    let cancelled = false
    setPending(true)
    setReason(null)
    fetchJson<{ resolved: boolean; target?: string; alias_table_used?: boolean; reason?: string }>(
      `${API_BASE}/devices/profiles/${encodeURIComponent(benchPin.packId)}/${encodeURIComponent(benchPin.model)}/${benchPin.kind}/resolve-alias`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: shorthand.group, key: shorthand.key }),
      },
    )
      .then((r) => {
        if (cancelled) return
        if (r.resolved && r.target) {
          setResolved({ target: r.target, aliasUsed: !!r.alias_table_used })
          setReason(null)
        } else {
          setResolved(null)
          setReason(r.reason ?? 'unmapped')
        }
      })
      .catch((err: Error) => {
        if (cancelled) return
        setResolved(null)
        setReason(err.message ?? 'resolver request failed')
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => { cancelled = true }
  }, [shorthand?.group, shorthand?.key, benchPin?.packId, benchPin?.model, benchPin?.kind])

  if (!shorthand) return null

  if (!benchPin) {
    return (
      <div
        data-testid="mixxx-alias-preview"
        style={{
          // carbon-allow: dense surface; off-grid between Carbon stops.
          padding: '8px 10px', marginBottom: 8, fontSize: 12,
          fontFamily: 'var(--mw-mono)', color: 'var(--mw-text-3)',
          border: '1px dashed var(--mw-line-2)',
        }}
      >
        ⓘ Mixxx-shorthand detected. Pick a Hardware-Store-pinned device in Step 01 to resolve through its alias table.
      </div>
    )
  }

  return (
    <div
      data-testid="mixxx-alias-preview"
      style={{
        // carbon-allow: dense surface; off-grid between Carbon stops.
        padding: '8px 10px', marginBottom: 8, fontSize: 12,
        fontFamily: 'var(--mw-mono)',
        background: resolved ? 'var(--mw-accent-soft)' : 'var(--mw-bg)',
        border: `1px solid ${resolved ? 'var(--mw-accent-line)' : 'var(--mw-line-2)'}`,
      }}
    >
      <div style={{ marginBottom: 4 }}>
        <strong>Mixxx alias resolve</strong> · {benchPin.packId}/{benchPin.model}.{benchPin.kind}
        {pending ? <span style={{ marginLeft: 8, opacity: 0.6 }}>resolving…</span> : null}
      </div>
      {resolved ? (
        <div>
          <div>
            <code>{shorthand.group}.{shorthand.key}</code>
            <span style={{ margin: '0 var(--cds-spacing-03)' }}>→</span>
            <code style={{ color: 'var(--mw-engine)' }}>{resolved.target}</code>
            {resolved.aliasUsed
              ? <span style={{ marginLeft: 8, opacity: 0.6 }}>(via pack alias_table)</span>
              : <span style={{ marginLeft: 8, opacity: 0.6 }}>(via WELL_KNOWN bridge)</span>}
          </div>
          <div style={{ marginTop: 6 }}>
            {selectedTargetId === `mixxx-alias::${resolved.target}` ? (
              <span data-testid="mixxx-alias-applied" style={{ color: 'var(--mw-engine)' }}>
                ✓ Applied as engine-performance target
              </span>
            ) : (
              <button
                data-testid="mixxx-alias-apply"
                onClick={() => onApply(buildMixxxAliasTarget(resolved.target))}
                style={{ fontFamily: 'var(--mw-mono)', fontSize: 12 }}
              >
                Use this resolved target
              </button>
            )}
          </div>
        </div>
      ) : reason ? (
        <div style={{ color: 'var(--mw-warn)' }}>
          Could not resolve: {reason}
        </div>
      ) : null}
    </div>
  )
}

function StepTarget({
  state,
  setState,
  plugins,
  engineParams,
  brainActions,
}: {
  state: WizardState
  setState: (next: Partial<WizardState>) => void
  plugins: Plugin[]
  engineParams: EngineParam[]
  brainActions: Array<{ id: string; label: string; kind: 'transport' | 'section' | 'slot' | 'layer'; value_type: 'trigger' | 'toggle' | 'continuous' }>
}) {
  const [cat, setCat] = useState<TargetCategory>(state.target?.cat ?? 'plugin-parameter')
  const [search, setSearch] = useState('')

  const targetsForCategory = useMemo(() => {
    if (cat === 'plugin-parameter') {
      const flat: PluginParamTarget[] = []
      for (const plugin of plugins) {
        for (const p of plugin.parameters ?? []) {
          flat.push({
            cat: 'plugin-parameter',
            id: `${plugin.uri}::${p.index}`,
            name: p.name,
            path: `${plugin.name} / ${p.symbol}`,
            pluginUri: plugin.uri,
            paramIndex: p.index,
            paramSymbol: p.symbol,
            range: [p.min, p.max],
            unit: '',
          })
        }
      }
      return flat.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.path.toLowerCase().includes(search.toLowerCase()))
    }
    if (cat === 'snapshot-trigger') {
      const items: SnapshotTriggerTarget[] = [
        { cat: 'snapshot-trigger', id: 'cmd.activate_chain', name: 'Activate chain', path: 'snapshot.activate_chain', action: 'activate_chain' },
        { cat: 'snapshot-trigger', id: 'cmd.toggle_chain', name: 'Toggle chain bypass', path: 'snapshot.toggle_chain', action: 'toggle_chain' },
        { cat: 'snapshot-trigger', id: 'cmd.toggle_plugin', name: 'Toggle plugin', path: 'snapshot.toggle_plugin', action: 'toggle_plugin' },
        { cat: 'snapshot-trigger', id: 'cmd.set_routing', name: 'Set routing', path: 'snapshot.set_routing', action: 'set_routing' },
        { cat: 'snapshot-trigger', id: 'cmd.next_preset', name: 'Next preset', path: 'snapshot.next_preset', action: 'next_preset' },
        { cat: 'snapshot-trigger', id: 'cmd.previous_preset', name: 'Previous preset', path: 'snapshot.previous_preset', action: 'previous_preset' },
      ]
      return items.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    }
    if (cat === 'routing-rule') {
      const items: RoutingTarget[] = (Object.keys(ROUTING_MODE_LABELS) as RoutingMode[]).map((m) => ({
        cat: 'routing-rule',
        id: `routing.${m}`,
        name: `Switch to ${ROUTING_MODE_LABELS[m]}`,
        path: `routing.mode = ${m}`,
        toMode: m,
      }))
      return items.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    }
    if (cat === 'brain-action') {
      const items: SequencerActionTarget[] = brainActions.map((a) => ({
        cat: 'brain-action',
        id: a.id,
        name: a.label,
        path: a.id,
        brainKind: a.kind,
        valueType: a.value_type,
      }))
      return items.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
        || t.path.toLowerCase().includes(search.toLowerCase()),
      )
    }
    // engine-performance
    const items: EnginePerformanceTarget[] = engineParams.map((p) => ({
      cat: 'engine-performance',
      id: p.id,
      name: p.label,
      path: p.id,
      paramId: p.id,
      range: [p.min, p.max],
      unit: p.unit ?? '',
    }))
    return items.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
  }, [cat, plugins, engineParams, brainActions, search])

  const counts = useMemo(() => ({
    'plugin-parameter': plugins.reduce((sum, p) => sum + (p.parameters?.length ?? 0), 0),
    'snapshot-trigger': 6,
    'routing-rule': Object.keys(ROUTING_MODE_LABELS).length,
    'engine-performance': engineParams.length,
    'brain-action': brainActions.length,
  }), [plugins, engineParams, brainActions])

  const categoryLabels: Record<TargetCategory, string> = {
    'plugin-parameter': 'Plugin parameter',
    'snapshot-trigger': 'Snapshot trigger',
    'routing-rule': 'Routing rule',
    'engine-performance': 'Engine performance',
    'brain-action': 'Brain action',
  }

  return (
    <div>
      <div className="crumb"><span className="step-n">Step 03</span> · Pick the target</div>
      <h1>What should this trigger?</h1>
      <p className="lede">
        Targets are everything the snapshot editor exposes — plugin parameters, snapshot commands, routing rules, and engine performance handles.
        Picking determines whether the next step is calibration (continuous) or trigger threshold (momentary).
      </p>

      <div className="target-grid">
        <div className="target-cats">
          {(Object.keys(categoryLabels) as TargetCategory[]).map((c) => (
            <button
              key={c}
              className={`target-cat ${cat === c ? 'active' : ''}`}
              onClick={() => setCat(c)}
            >
              <span>{categoryLabels[c]}</span>
              <span className="count">{counts[c]}</span>
            </button>
          ))}
        </div>
        <div>
          <input
            type="text"
            placeholder="Search targets… (or type [Channel1].volume to resolve via Mixxx alias)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--mw-bg)',
              border: '1px solid var(--mw-line-2)',
              // carbon-allow: dense search input 8x10px (between Carbon stops).
              padding: '8px 10px',
              fontFamily: 'var(--mw-mono)',
              marginBottom: 8,
            }}
          />
          <MixxxAliasPreview
            query={search}
            surface={state.surface}
            selectedTargetId={state.target?.id ?? null}
            onApply={(t) => {
              setCat('engine-performance')
              setState({ target: t })
            }}
          />
          <div className="target-list">
            {targetsForCategory.length === 0 && (
              <div style={{ padding: 16, color: 'var(--mw-text-3)', fontSize: 13 }}>
                No matches{search ? ` for "${search}"` : ''}. Load some plugins or pick another category.
              </div>
            )}
            {targetsForCategory.slice(0, 200).map((item) => (
              <div
                key={item.id}
                className={`target-item ${state.target?.id === item.id ? 'selected' : ''}`}
                onClick={() => setState({ target: item as WizardTarget })}
              >
                <div>
                  <div className="nm">{item.name}</div>
                  <div className="pth">{item.path}</div>
                </div>
                <div className="tag">{item.cat.replace('-', ' ')}</div>
              </div>
            ))}
            {targetsForCategory.length > 200 && (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--mw-text-3)', fontFamily: 'var(--mw-mono)' }}>
                showing 200 of {targetsForCategory.length} · refine search to narrow
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// T2461-A6 — MIDI source sample captured during a Brain capture
// window. `value` is normalised 0..1 from the message's raw value
// (CC/note velocity/PC). `relativeMs` is offset from capture start
// so the side-by-side renderer can plot it against the Brain frames'
// `(ts - started_at)` timeline.
export interface MidiSourceSample {
  relativeMs: number
  value: number
  type: 'cc' | 'note' | 'pc' | 'other'
  cc?: number
  note?: number
  pc?: number
  ch: number
}

// T2461-A6 — convert a wall-clock MIDI message into a normalised
// sample relative to a capture window's start time (epoch seconds,
// matching the Brain capture buffer's `started_at`).
export function buildMidiSourceSample(
  message: MidiMessage,
  startedAtEpochS: number,
  nowEpochS: number,
): MidiSourceSample {
  const relativeMs = Math.max(0, (nowEpochS - startedAtEpochS) * 1000)
  const raw = typeof message.v === 'number' ? message.v : 0
  // CC/note share the 0..127 range; PC has no value so we centre at 1.
  const normalised = message.type === 'pc' ? 1 : Math.max(0, Math.min(1, raw / 127))
  return {
    relativeMs,
    value: normalised,
    type: message.type,
    cc: message.cc,
    note: message.note,
    pc: message.pc,
    ch: message.ch,
  }
}

// T2461-A6 — render a list of MIDI source samples as an SVG path
// over a shared timeline. Empty sample list yields an empty path so
// the caller can decide whether to show a placeholder.
export function buildMidiSourceWaveformPath(
  samples: MidiSourceSample[],
  durationS: number,
  width: number,
  height: number,
): string {
  if (samples.length === 0 || durationS <= 0 || width <= 0 || height <= 0) {
    return ''
  }
  const points = samples.map((s) => {
    const t = Math.max(0, Math.min(1, s.relativeMs / (durationS * 1000)))
    const x = t * width
    const y = height - s.value * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${points.join(' L ')}`
}

// T2461-A6 — Brain capture widget. Operator clicks Capture; backend
// arms the buffer for the supplied slot for `durationS`; while the
// window is open, every incoming MIDI source message lands in
// `midiSamplesRef.current` keyed by relativeMs offset. After stop, the
// widget renders Brain output (top) + MIDI source (bottom) on a shared
// timeline with a vertical alignment cursor the operator can scrub.
function SequencerCaptureWidget({
  midiSampleSinkRef,
}: {
  midiSampleSinkRef: React.MutableRefObject<((message: MidiMessage) => void) | null>
}): React.JSX.Element {
  const [slotId, setSlotId] = useState(0)
  const [durationS, setDurationS] = useState(5)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{
    sessionId: string
    startedAt: number
    durationS: number
    frames: Array<{ ts: number; peak_db: number; rms_db: number; clipping: boolean }>
    midiSamples: MidiSourceSample[]
  } | null>(null)
  const [cursorRelMs, setCursorRelMs] = useState<number | null>(null)
  const liveMidiBufferRef = useRef<MidiSourceSample[]>([])
  const captureStartedAtRef = useRef<number | null>(null)

  // Detach the sample sink whenever the widget unmounts so we don't
  // leak the ref and accidentally record into a previous session.
  useEffect(() => {
    return () => {
      midiSampleSinkRef.current = null
    }
  }, [midiSampleSinkRef])

  const handleCapture = useCallback(async () => {
    setPending(true)
    setError(null)
    setSession(null)
    setCursorRelMs(null)
    liveMidiBufferRef.current = []
    captureStartedAtRef.current = null
    try {
      const start = await sequencerApi.startCapture(slotId, durationS)
      // Arm the MIDI source sink — every incoming message during the
      // capture window lands in liveMidiBufferRef.
      const armedAtEpochS = Date.now() / 1000
      captureStartedAtRef.current = armedAtEpochS
      midiSampleSinkRef.current = (message: MidiMessage) => {
        const startedAt = captureStartedAtRef.current ?? armedAtEpochS
        liveMidiBufferRef.current.push(
          buildMidiSourceSample(message, startedAt, Date.now() / 1000),
        )
      }
      // Wait for the capture to finish, then stop + fetch frames.
      await new Promise((r) => window.setTimeout(r, durationS * 1000 + 200))
      await sequencerApi.stopCapture()
      midiSampleSinkRef.current = null
      const detail = await sequencerApi.getCapture(start.session_id)
      if (!detail.found || !detail.frames || !detail.started_at || !detail.duration_s) {
        setError('Capture session had no frames (Brain meter pipeline idle).')
        return
      }
      // The Brain capture buffer's started_at is authoritative — use
      // it (not the wizard's wall-clock arming time) to align the
      // MIDI samples so any latency between startCapture() and the
      // backend buffer arming is absorbed.
      const authoritativeStartedAt = detail.started_at
      const authoritativeDurationS = detail.duration_s
      const realignedMidi = liveMidiBufferRef.current
        .map((s) => ({
          ...s,
          // Re-anchor to the backend-truth started_at: relativeMs was
          // armedAtEpochS-based, which we offset by the diff.
          relativeMs: s.relativeMs + ((armedAtEpochS - authoritativeStartedAt) * 1000),
        }))
        .filter((s) => s.relativeMs >= 0 && s.relativeMs <= authoritativeDurationS * 1000)
      setSession({
        sessionId: start.session_id,
        startedAt: authoritativeStartedAt,
        durationS: authoritativeDurationS,
        frames: detail.frames as Array<{ ts: number; peak_db: number; rms_db: number; clipping: boolean }>,
        midiSamples: realignedMidi,
      })
    } catch (err) {
      midiSampleSinkRef.current = null
      setError((err as Error).message ?? 'capture failed')
    } finally {
      setPending(false)
    }
  }, [slotId, durationS, midiSampleSinkRef])

  const brainPath = session
    ? buildSequencerCaptureWaveformPath(session.frames, session.startedAt, session.durationS, 320, 60)
    : ''
  const midiPath = session
    ? buildMidiSourceWaveformPath(session.midiSamples, session.durationS, 320, 60)
    : ''
  const cursorX = session && cursorRelMs !== null
    ? Math.max(0, Math.min(320, (cursorRelMs / (session.durationS * 1000)) * 320))
    : null
  const handleSvgMove = useCallback((evt: React.MouseEvent<SVGSVGElement>) => {
    if (!session) return
    const rect = (evt.currentTarget as SVGSVGElement).getBoundingClientRect()
    const x = evt.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, rect.width)))
    setCursorRelMs(ratio * session.durationS * 1000)
  }, [session])
  const handleSvgLeave = useCallback(() => setCursorRelMs(null), [])

  return (
    <div
      data-testid="brain-capture-widget"
      style={{
        // carbon-allow: dense surface; off-grid between Carbon stops.
        padding: '8px 10px', marginBottom: 12, fontSize: 12,
        fontFamily: 'var(--mw-mono)', border: '1px solid var(--mw-line-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Brain + MIDI capture (T2461-A6)</strong>
        <label>slot
          <input
            type="number" min={0} max={15} value={slotId}
            onChange={(e) => setSlotId(Number(e.target.value))}
            style={{ width: 48, marginLeft: 4 }}
          />
        </label>
        <label>seconds
          <input
            type="number" min={1} max={30} value={durationS}
            onChange={(e) => setDurationS(Number(e.target.value))}
            style={{ width: 48, marginLeft: 4 }}
          />
        </label>
        <button onClick={handleCapture} disabled={pending}>
          {pending ? 'Capturing…' : 'Calibrate (capture both)'}
        </button>
        {session ? (
          <span style={{ opacity: 0.6 }}>
            {session.frames.length} brain · {session.midiSamples.length} midi frames
          </span>
        ) : null}
      </div>
      {error ? (
        <div style={{ color: 'var(--mw-warn)', marginTop: 6 }}>{error}</div>
      ) : null}
      {session ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--mw-text-3)' }}>
            Brain output ({session.frames.length} frames)
            {cursorRelMs !== null ? ` · cursor @ ${(cursorRelMs / 1000).toFixed(2)}s` : ''}
          </div>
          <svg
            width="320" height="60"
            style={{ background: 'var(--mw-bg)', border: '1px solid var(--mw-line-2)', cursor: 'crosshair' }}
            aria-label="Brain capture waveform"
            data-testid="brain-capture-svg"
            onMouseMove={handleSvgMove}
            onMouseLeave={handleSvgLeave}
          >
            <line x1={0} y1={60} x2={320} y2={60} stroke="var(--mw-line-2)" strokeWidth={1} />
            <path d={brainPath} fill="none" stroke="var(--mw-engine)" strokeWidth={1.5} />
            {cursorX !== null ? (
              <line
                x1={cursorX} y1={0} x2={cursorX} y2={60}
                stroke="var(--mw-accent)" strokeWidth={1}
                data-testid="alignment-cursor-brain"
              />
            ) : null}
          </svg>
          <div style={{ fontSize: 10, color: 'var(--mw-text-3)', marginTop: 4 }}>
            MIDI source ({session.midiSamples.length} samples)
            {session.midiSamples.length === 0 ? ' · move a control during the next capture' : ''}
          </div>
          <svg
            width="320" height="60"
            style={{ background: 'var(--mw-bg)', border: '1px solid var(--mw-line-2)', cursor: 'crosshair' }}
            aria-label="MIDI source waveform"
            data-testid="midi-source-svg"
            onMouseMove={handleSvgMove}
            onMouseLeave={handleSvgLeave}
          >
            <line x1={0} y1={60} x2={320} y2={60} stroke="var(--mw-line-2)" strokeWidth={1} />
            <path d={midiPath} fill="none" stroke="var(--mw-source, var(--mw-accent))" strokeWidth={1.5} />
            {cursorX !== null ? (
              <line
                x1={cursorX} y1={0} x2={cursorX} y2={60}
                stroke="var(--mw-accent)" strokeWidth={1}
                data-testid="alignment-cursor-midi"
              />
            ) : null}
          </svg>
        </div>
      ) : null}
    </div>
  )
}

function StepCalibrate({
  state,
  setState,
  midiSampleSinkRef,
}: {
  state: WizardState
  setState: (next: Partial<WizardState>) => void
  midiSampleSinkRef: React.MutableRefObject<((message: MidiMessage) => void) | null>
}) {
  const cal = state.calibration ?? DEFAULT_CALIBRATION
  const set = (patch: Partial<WizardCalibration>) => setState({ calibration: { ...cal, ...patch } })
  const target = state.target

  // Per-Q6 variant — what fields apply depends on category.
  const isContinuous = target?.cat === 'plugin-parameter' || target?.cat === 'engine-performance'
  const isTrigger = target?.cat === 'snapshot-trigger'
  const isRouting = target?.cat === 'routing-rule'

  const promotedToExpression = isContinuous && (cal.curve === 'Custom' || cal.deadzoneL > 0 || cal.deadzoneH > 0)

  return (
    <div>
      <div className="crumb"><span className="step-n">Step 04</span> · Calibrate the response</div>
      <h1>Shape the curve.</h1>
      <p className="lede">
        Map raw input range to target output range, pick a curve, and set deadzones.
        For continuous targets, this is where heel/toe + dwell shape the feel.
      </p>

      {promotedToExpression && (
        <div style={{
          background: 'var(--mw-accent-soft)', border: '1px solid var(--mw-accent-line)',
          padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', fontSize: 12, fontFamily: 'var(--mw-mono)',
          color: 'var(--mw-text-2)', marginBottom: 16,
        }}>
          ⓘ This binding will save as an Expression Assignment (Custom curve / non-zero deadzone).
        </div>
      )}

      {/* T2461-A6 — Brain capture widget. Surfaced for any target so
          operators can capture the Brain response while dialling the
          curve, regardless of whether the target is a Brain action. */}
      <SequencerCaptureWidget midiSampleSinkRef={midiSampleSinkRef} />

      <div className="cal">
        <div className="cal-fields">
          <div className="field">
            <div className="lbl">Mapping name</div>
            <input type="text" value={cal.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field">
            <div className="lbl">Scope</div>
            <select value={cal.scope} onChange={(e) => set({ scope: e.target.value as 'global' | 'chain' })}>
              <option value="global">Global</option>
              <option value="chain">Per-chain (active chain)</option>
            </select>
          </div>

          {isContinuous && (
            <>
              <div className="field">
                <div className="lbl">Input range</div>
                <div className="range-pair">
                  <input type="number" value={cal.minIn} onChange={(e) => set({ minIn: Number(e.target.value) })} />
                  <span>→</span>
                  <input type="number" value={cal.maxIn} onChange={(e) => set({ maxIn: Number(e.target.value) })} />
                </div>
              </div>
              <div className="field">
                <div className="lbl">Output range</div>
                <div className="range-pair">
                  <input type="number" value={cal.minOut} onChange={(e) => set({ minOut: Number(e.target.value) })} />
                  <span>→</span>
                  <input type="number" value={cal.maxOut} onChange={(e) => set({ maxOut: Number(e.target.value) })} />
                </div>
              </div>
              <div className="field">
                <div className="lbl">Deadzone (L / H)</div>
                <div className="range-pair">
                  <input type="number" value={cal.deadzoneL} onChange={(e) => set({ deadzoneL: Number(e.target.value) })} />
                  <span>·</span>
                  <input type="number" value={cal.deadzoneH} onChange={(e) => set({ deadzoneH: Number(e.target.value) })} />
                </div>
              </div>
              <div className="field">
                <div className="lbl">Invert</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cal.invert}
                  aria-label="Invert"
                  className={`switch ${cal.invert ? 'on' : ''}`}
                  onClick={() => set({ invert: !cal.invert })}
                />
              </div>
              <div className="field">
                <div className="lbl">LED feedback</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cal.feedback}
                  aria-label="LED feedback"
                  className={`switch ${cal.feedback ? 'on' : ''}`}
                  onClick={() => set({ feedback: !cal.feedback })}
                />
              </div>
            </>
          )}

          {isTrigger && (
            <div className="field">
              <div className="lbl">Velocity / value threshold</div>
              <input type="number" min="0" max="127" value={cal.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
            </div>
          )}

          {isRouting && (
            <>
              <div className="field">
                <div className="lbl">From flow index</div>
                <input type="number" min="0" value={cal.fromFlow} onChange={(e) => set({ fromFlow: Number(e.target.value) })} />
              </div>
              <div className="field">
                <div className="lbl">To flow index</div>
                <input type="number" min="0" value={cal.toFlow} onChange={(e) => set({ toFlow: Number(e.target.value) })} />
              </div>
            </>
          )}

          <div className="field">
            <div className="lbl">Enabled</div>
            <button
              type="button"
              role="switch"
              aria-checked={cal.enabled}
              aria-label="Enabled"
              className={`switch ${cal.enabled ? 'on' : ''}`}
              onClick={() => set({ enabled: !cal.enabled })}
            />
          </div>
        </div>

        {isContinuous && (
          <div className="curve-card">
            <div className="hd">Response curve</div>
            <CurveSvg curve={cal.curve} invert={cal.invert} />
            <div className="curve-presets">
              {(['Linear', 'Exp', 'Log', 'S-curve', 'Custom'] as CurveName[]).map((p) => (
                <button key={p} className={cal.curve === p ? 'active' : ''} onClick={() => set({ curve: p })}>{p}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepTest({
  state,
  simulate,
  setSimulate,
  onSendToEngine,
  onFireTrigger,
}: {
  state: WizardState
  simulate: { v: number }
  setSimulate: (next: { v: number }) => void
  onSendToEngine: (calibratedValue: number) => void
  onFireTrigger: () => void
}) {
  const cal = state.calibration ?? DEFAULT_CALIBRATION
  const target = state.target
  const isContinuous = target?.cat === 'plugin-parameter' || target?.cat === 'engine-performance'

  const norm = Math.max(0, Math.min(1, (simulate.v - cal.minIn) / Math.max(1, cal.maxIn - cal.minIn)))
  let curved = norm
  if (cal.curve === 'Exp') curved = norm * norm
  else if (cal.curve === 'Log') curved = Math.sqrt(norm)
  else if (cal.curve === 'S-curve') curved = 0.5 - 0.5 * Math.cos(Math.PI * norm)
  if (cal.invert) curved = 1 - curved
  const out = cal.minOut + curved * (cal.maxOut - cal.minOut)

  const sourceLabel = state.source
    ? state.source.kind === 'cc' ? `CC ${state.source.cc} · ch ${state.source.ch}`
    : state.source.kind === 'note' ? `Note ${state.source.note} · ch ${state.source.ch}`
    : `PC ${state.source.pc} · ch ${state.source.ch}`
    : '—'

  return (
    <div>
      <div className="crumb"><span className="step-n">Step 05</span> · Test the binding</div>
      <h1>Wiggle it. Watch it land.</h1>
      <p className="lede">
        Move the source on your surface or scrub the simulator below.
        {isContinuous ? ' Use Send to engine to actually move the audio engine.' : ' Use Fire trigger to invoke the action live.'}
      </p>

      <div className="test-stage">
        <div className="test-side">
          <div className="lbl">Input · {sourceLabel}</div>
          <div className="test-input">
            <div className="v">{simulate.v}</div>
            <div className="test-bar"><div className="fill" style={{ transform: `scaleX(${norm})` }} /></div>
            <input type="range" min="0" max="127" value={simulate.v} onChange={(e) => setSimulate({ v: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--mw-accent)' }} />
          </div>
          <div className="test-handles">
            <button className="heel" onClick={() => setSimulate({ v: cal.minIn })}>◀ Heel · {cal.minIn}</button>
            <button onClick={() => setSimulate({ v: Math.round((cal.minIn + cal.maxIn) / 2) })}>● Live · mid</button>
            <button className="toe" onClick={() => setSimulate({ v: cal.maxIn })}>Toe · {cal.maxIn} ▶</button>
          </div>
        </div>

        <div className="test-side">
          <div className="lbl">Output · {target?.name ?? '—'}</div>
          <div className="test-output">
            <div className="v">{Math.round(out * 10) / 10}</div>
            <div className="unit">
              {('unit' in (target ?? {}) ? (target as PluginParamTarget).unit : '') || ''} · {target?.path ?? ''}
            </div>
            <div className="test-bar">
              <div
                className="fill"
                style={{ background: 'var(--mw-engine)', transform: `scaleX(${(out - cal.minOut) / Math.max(1, cal.maxOut - cal.minOut)})` }}
              />
            </div>
          </div>
          <div className="test-handles">
            <button onClick={() => setSimulate({ v: Math.max(cal.minIn, simulate.v - 5) })}>− 5</button>
            <button onClick={() => setSimulate({ v: Math.min(cal.maxIn, simulate.v + 5) })}>+ 5</button>
            <button onClick={() => setSimulate({ v: Math.round(Math.random() * 127) })}>Random</button>
          </div>
          <div className="test-handles" style={{ marginTop: 8 }}>
            {isContinuous && (
              <button className="btn engine" onClick={() => onSendToEngine(out)}>▶ Send to engine</button>
            )}
            {!isContinuous && (
              <button className="btn engine" onClick={onFireTrigger}>▶ Fire trigger</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepSave({
  state,
  conflict,
  saving,
  onSave,
}: {
  state: WizardState
  conflict: MIDIMappingV2 | MIDICommand | null
  saving: boolean
  onSave: (mode: 'commit' | 'andNew') => void
}) {
  const surf = state.surface
  const src = state.source
  const tgt = state.target
  const cal = state.calibration ?? DEFAULT_CALIBRATION

  const srcLabel = !src ? '—'
    : src.kind === 'cc' ? `CC ${src.cc} · ch ${src.ch}`
    : src.kind === 'note' ? `Note ${src.note} · ch ${src.ch}`
    : `PC ${src.pc} · ch ${src.ch}`

  return (
    <div>
      <div className="crumb"><span className="step-n">Step 06</span> · Review &amp; save</div>
      <h1>Looking good?</h1>
      <p className="lede">
        Final check before this binding is committed to your active mapping group. You can keep going (start another binding on the same surface) or close out.
      </p>

      {conflict && (
        <div style={{
          background: 'color-mix(in srgb, var(--mw-danger) 12%, transparent)', border: '1px solid var(--mw-danger)',
          padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', marginBottom: 16, fontSize: 13,
        }}>
          ⚠ <b>Conflict</b> — this CC + channel + scope is already bound to{' '}
          <b>{('name' in conflict ? conflict.name : null) ?? 'an existing mapping'}</b>.
          Saving will create a duplicate; both will fire.
        </div>
      )}

      <div className="save-summary">
        <div className="summary-flow">
          <div className="summary-node">
            <div className="l">Surface</div>
            <div className="v">{surf?.shortLabel || '—'}</div>
          </div>
          <div className="summary-arrow">━▶</div>
          <div className="summary-node">
            <div className="l">Source</div>
            <div className="v" style={{ fontFamily: 'var(--mw-mono)' }}>{srcLabel}</div>
          </div>
          <div className="summary-arrow">━▶</div>
          <div className="summary-node">
            <div className="l">Target</div>
            <div className="v">{tgt?.name ?? '—'}</div>
          </div>
        </div>

        <hr className="thin" />

        <div className="grid-2">
          <div>
            <div className="section-h">Calibration</div>
            <div style={{ fontFamily: 'var(--mw-mono)', fontSize: 12, lineHeight: 1.9, color: 'var(--mw-text-2)' }}>
              <div>name &nbsp;&nbsp;&nbsp; <b style={{ color: 'var(--mw-text)' }}>{cal.name}</b></div>
              <div>scope&nbsp;&nbsp;&nbsp; {cal.scope}</div>
              <div>range&nbsp;&nbsp;&nbsp;&nbsp; in {cal.minIn}–{cal.maxIn} → out {cal.minOut}–{cal.maxOut}</div>
              <div>curve&nbsp;&nbsp;&nbsp;&nbsp; {cal.curve}{cal.invert ? ' (inverted)' : ''}</div>
              <div>deadzone {cal.deadzoneL} / {cal.deadzoneH}</div>
              <div>feedback {cal.feedback ? 'on' : 'off'}</div>
              <div>enabled&nbsp; {cal.enabled ? 'yes' : 'no'}</div>
            </div>
          </div>
          <div>
            <div className="section-h">Target path</div>
            <div style={{ fontFamily: 'var(--mw-mono)', fontSize: 12, lineHeight: 1.9, color: 'var(--mw-text-2)' }}>
              <div>category &nbsp;{tgt?.cat ?? '—'}</div>
              <div>path &nbsp;&nbsp;&nbsp;&nbsp; {tgt?.path ?? '—'}</div>
            </div>
          </div>
        </div>

        <hr className="thin" />

        <div className="row-flex">
          <button className="btn engine large" disabled={saving} onClick={() => onSave('commit')}>✓ Commit binding</button>
          <button className="btn ghost large" disabled={saving} onClick={() => onSave('andNew')}>Save &amp; bind another</button>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--mw-mono)', fontSize: 11, color: 'var(--mw-text-3)' }}>
            {saving ? 'saving…' : 'sync to controller →'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Advanced drawer ────────────────────────────────────────────────────────
function AdvancedDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={open ? 0 : -1}
        className={`drawer-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`drawer ${open ? 'open' : ''}`}>
        <div className="hd">
          Advanced · all v1 controls (legacy MIDI Assignments)
          <button className="x" onClick={onClose}><Close size={20} /></button>
        </div>
        <div className="body" style={{ padding: 0 }}>
          <ErrorBoundary title="Advanced drawer crashed">
            <LegacyMidiAssignments />
          </ErrorBoundary>
        </div>
      </div>
    </>
  )
}

// ─── Page shell ─────────────────────────────────────────────────────────────
export function MidiAssignmentsPage() {
  const [searchParams] = useSearchParams()
  const snapshotIdFromQuery = useMemo(() => {
    const raw = searchParams.get('snapshotId')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const queryClient = useQueryClient()

  // T2461-A6 — page-owned MIDI sample sink. Set by SequencerCaptureWidget
  // during a capture window; LiveMidiStrip's onSample fans every
  // ingested message through this ref so the wizard can record source
  // samples in sync with the Brain output capture for side-by-side
  // alignment plotting. Cleared back to null when the widget unmounts
  // or when its capture finishes.
  const midiSampleSinkRef = useRef<((message: MidiMessage) => void) | null>(null)
  const handleMidiSample = useCallback((message: MidiMessage) => {
    midiSampleSinkRef.current?.(message)
  }, [])

  // ─── Data sources ────────────────────────────────────────────────────────
  const enrichedQuery = useQuery({
    queryKey: ['enriched-physical-surfaces'],
    queryFn: () => fetchJson<{ status: string; summary: { units?: Array<{ unit_id: string; display_name?: string; status?: string; capabilities?: string[] }> } }>(`${API_BASE}/enriched-midi-physical-surfaces/summary`, { cache: 'no-store' }),
    retry: false,
  })

  const pluginsQuery = useQuery({
    queryKey: ['plugins', 'all'],
    queryFn: () => pluginsApi.getAll(),
    retry: false,
  })

  const engineParamsQuery = useQuery({
    queryKey: ['expression-engine-parameters'],
    queryFn: () => fetchJson<{ parameters: EngineParam[] }>(`${API_BASE}/v2/engine/parameters`),
    retry: false,
    staleTime: 60_000,
  })

  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    retry: false,
  })

  const mappingsQuery = useQuery({
    queryKey: ['midi', 'mappings'],
    queryFn: () => midiApiV2.getMappings(),
    retry: false,
  })

  const commandsQuery = useQuery({
    queryKey: ['midi', 'commands'],
    queryFn: () => midiApiV2.getCommands(),
    retry: false,
  })

  // T2461-A4 — fetch the Brain action catalogue once per page mount.
  // Static data; the fetch is lightweight and the wizard's StepTarget
  // is the only consumer.
  const brainActionsQuery = useQuery({
    queryKey: ['sequencer', 'actions'],
    queryFn: () => sequencerApi.listActions(),
    retry: false,
    staleTime: 5 * 60 * 1000,   // 5 min
  })
  const brainActions = brainActionsQuery.data?.actions ?? []

  const adaptedSurfaces = useMemo(
    () => buildAdaptedSurfaces(enrichedQuery.data?.summary),
    [enrichedQuery.data],
  )

  // T2461-A1 — Hardware Store pinned devices appear as synthetic
  // AdaptedSurface entries at the top of the wizard's device picker.
  // The Hardware Store BenchStateTracker is the single source of truth
  // for "this is the device I'm working on right now"; we read it and
  // merge into the existing surface list so operators don't pin twice.
  const knownDevicesQuery = useQuery({
    queryKey: ['devices', 'known-for-wizard'],
    queryFn: async () => {
      const r = await fetch('/api/devices/known')
      if (!r.ok) throw new Error(`/api/devices/known ${r.status}`)
      return r.json() as Promise<{
        known: Array<{ profile_key: string; is_pinned: boolean; last_seen_at: number | null }>
      }>
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  })

  const surfacesWithBenchPins = useMemo<AdaptedSurface[]>(
    () => mergeBenchPinsIntoSurfaces(
      adaptedSurfaces,
      (knownDevicesQuery.data?.known ?? []).filter((r) => r.is_pinned).map((r) => r.profile_key),
    ),
    [adaptedSurfaces, knownDevicesQuery.data],
  )

  // ─── Pinned surface (Q2) ─────────────────────────────────────────────────
  const [pinnedId, setPinnedId] = usePinnedSurfaceId()
  const pinnedSurface = adaptedSurfaces.find((s) => s.id === pinnedId) ?? null

  // ─── Wizard state ────────────────────────────────────────────────────────
  const [stepIdx, setStepIdx] = useState<number>(0)
  const [state, setState] = useState<WizardState>(() => ({
    surface: null,
    sourceMode: 'learn',
    listening: false,
    source: null,
    target: null,
    calibration: null,
    activeControl: null,
    channel: 1,
  }))
  const updateState = useCallback((patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch })), [])

  // Auto-advance: when pinned surface is online and we land on Step 1 with no selection,
  // pre-select the pinned surface and jump to Step 2 once.
  const autoAdvancedRef = useRef(false)
  useEffect(() => {
    if (autoAdvancedRef.current) return
    if (!pinnedSurface || pinnedSurface.status !== 'online') return
    if (stepIdx !== 0 || state.surface) return
    setState((prev) => ({ ...prev, surface: pinnedSurface }))
    setStepIdx(1)
    autoAdvancedRef.current = true
  }, [pinnedSurface, stepIdx, state.surface])

  // Snapshot context — Q8: default scope to per-chain when launched from a snapshot.
  useEffect(() => {
    if (snapshotIdFromQuery && state.calibration?.scope === 'global') {
      setState((prev) => prev.calibration ? { ...prev, calibration: { ...prev.calibration, scope: 'chain' } } : prev)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotIdFromQuery])

  // ─── Step gating ─────────────────────────────────────────────────────────
  const stepReady = useCallback((i: number) => {
    if (i === 0) return true
    if (i === 1) return !!state.surface
    if (i === 2) return !!state.source
    if (i === 3) return !!state.target
    if (i === 4) return !!state.target
    if (i === 5) return !!state.target && !!state.source
    return false
  }, [state.surface, state.source, state.target])

  const stepDone = useCallback((i: number) => {
    if (i === 0) return !!state.surface
    if (i === 1) return !!state.source
    if (i === 2) return !!state.target
    if (i === 3) return !!state.calibration
    if (i === 4) return stepIdx > 4
    return false
  }, [state.surface, state.source, state.target, state.calibration, stepIdx])

  const goNext = useCallback(() => {
    if (stepIdx === 2 && !state.calibration) {
      // Seed calibration from target when entering Step 4
      const t = state.target
      const seed: WizardCalibration = { ...DEFAULT_CALIBRATION, name: t?.name ?? 'New mapping' }
      if (t && (t.cat === 'plugin-parameter' || t.cat === 'engine-performance')) {
        seed.minOut = t.range[0]
        seed.maxOut = t.range[1]
      }
      if (snapshotIdFromQuery) seed.scope = 'chain'
      setState((prev) => ({ ...prev, calibration: seed }))
    }
    setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))
  }, [stepIdx, state.target, state.calibration, snapshotIdFromQuery])

  const goPrev = useCallback(() => setStepIdx((i) => Math.max(0, i - 1)), [])

  // ─── Live MIDI strip + listen capture (Q4, Q9) ───────────────────────────
  const [stripCollapsed, setStripCollapsed] = useState(false)
  const onCaptureListen = useCallback((message: MidiMessage) => {
    if (!state.listening) return
    const next: WizardSource =
      message.type === 'cc' ? { kind: 'cc', cc: message.cc!, ch: message.ch }
      : message.type === 'note' ? { kind: 'note', note: message.note!, ch: message.ch }
      : { kind: 'pc', pc: message.pc!, ch: message.ch }
    setState((prev) => ({ ...prev, source: next, listening: false }))
  }, [state.listening])

  // ─── Step 5 — Send to engine / Fire trigger (Q7) ─────────────────────────
  const setPluginParameterMutation = useMutation({
    mutationFn: ({ uri, idx, value }: { uri: string; idx: number; value: number }) =>
      pluginsApi.setParameter(uri, idx, value),
  })

  const onSendToEngine = useCallback((calibratedValue: number) => {
    const t = state.target
    if (!t) return
    if (t.cat === 'plugin-parameter') {
      setPluginParameterMutation.mutate({ uri: t.pluginUri, idx: t.paramIndex, value: calibratedValue })
    }
    // Engine-performance: there's no generic "set engine param" endpoint; ExpressionPage
    // does it via /v2/expression/* but only for committed assignments. For preview, use
    // testMappingFeedback after save would be the proper path. For now, no-op with a hint.
  }, [state.target, setPluginParameterMutation])

  const onFireTrigger = useCallback(() => {
    // Same caveat as engine-performance: snapshot triggers and routing rules don't have
    // a pre-save "fire once" endpoint. Skipping until backend exposes one.
  }, [])

  // ─── Step 6 — Save (Q8: conflict warn + scope default) ───────────────────
  const conflictMapping = useMemo<MIDIMappingV2 | MIDICommand | null>(() => {
    const src = state.source
    if (!src) return null
    if (state.target?.cat === 'plugin-parameter' || state.target?.cat === 'engine-performance') {
      const list = mappingsQuery.data?.mappings ?? []
      return list.find((m) =>
        m.cc === (src.cc ?? -1)
        && (m.channel === src.ch || m.channel === 0 || src.ch === 0)
      ) ?? null
    }
    if (state.target?.cat === 'snapshot-trigger') {
      const list = commandsQuery.data?.commands ?? []
      return list.find((c) =>
        c.data1 === (src.cc ?? src.note ?? src.pc ?? -1)
        && (c.channel === src.ch || c.channel === 0 || src.ch === 0)
      ) ?? null
    }
    return null
  }, [state.source, state.target, mappingsQuery.data, commandsQuery.data])

  const createMappingMutation = useMutation({
    mutationFn: (payload: Partial<MIDIMappingV2>) => midiApiV2.createMapping(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }),
  })
  const createCommandMutation = useMutation({
    mutationFn: (payload: Partial<MIDICommand>) => midiApiV2.createCommand(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }),
  })
  const createRoutingMutation = useMutation({
    mutationFn: (payload: Partial<MIDIRoutingRule>) => midiApiV2.createRoutingRule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }),
  })
  const createExpressionAssignmentMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => fetchJson(`${API_BASE}/v2/expression/assignments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expression-assignments'] }),
  })

  const saving = createMappingMutation.isPending
    || createCommandMutation.isPending
    || createRoutingMutation.isPending
    || createExpressionAssignmentMutation.isPending

  const findActiveChainId = useCallback((): number | null => {
    const chains = (chainsQuery.data as { chains?: Chain[] } | undefined)?.chains
      ?? (Array.isArray(chainsQuery.data) ? chainsQuery.data as Chain[] : null)
    if (!chains) return null
    const active = chains.find((c) => c.is_active)
    return active?.id ?? chains[0]?.id ?? null
  }, [chainsQuery.data])

  const onSave = useCallback(async (mode: 'commit' | 'andNew') => {
    const cal = state.calibration ?? DEFAULT_CALIBRATION
    const src = state.source
    const tgt = state.target
    if (!src || !tgt) return

    const triggerType: MIDITriggerType = src.kind === 'cc' ? 'control_change'
      : src.kind === 'note' ? 'note_on'
      : 'program_change'

    const data1 = src.cc ?? src.note ?? src.pc ?? 0
    const channel = src.ch
    const chainId = cal.scope === 'chain' ? findActiveChainId() : null

    try {
      if (tgt.cat === 'plugin-parameter' || tgt.cat === 'engine-performance') {
        const promoted = cal.curve === 'Custom' || cal.deadzoneL > 0 || cal.deadzoneH > 0
        if (promoted) {
          // ExpressionAssignment (auto-promotion per Q6)
          await createExpressionAssignmentMutation.mutateAsync({
            cc: data1,
            channel,
            cc_min: cal.minIn,
            cc_max: cal.maxIn,
            param_id: tgt.cat === 'plugin-parameter'
              ? `${tgt.pluginUri}::${tgt.paramIndex}`
              : tgt.paramId,
            param_label: tgt.name,
            out_min: cal.minOut,
            out_max: cal.maxOut,
            curve: cal.curve.toLowerCase(),
            active: cal.enabled,
          })
        } else {
          const payload: Partial<MIDIMappingV2> = {
            cc: data1,
            channel,
            chain_id: chainId,
            target_plugin_uri: tgt.cat === 'plugin-parameter' ? tgt.pluginUri : null,
            target_param_index: tgt.cat === 'plugin-parameter' ? tgt.paramIndex : null,
            target_param_symbol: tgt.cat === 'plugin-parameter' ? tgt.paramSymbol : null,
            min_val: cal.minOut,
            max_val: cal.maxOut,
            curve_type: ({
              Linear: 'linear',
              Exp: 'exponential',
              Log: 'logarithmic',
              'S-curve': 's_curve',
              Custom: 'linear',
            } as Record<CurveName, MIDICurveType>)[cal.curve],
            invert: cal.invert,
            feedback_enabled: cal.feedback,
            feedback_cc: null,
            is_enabled: cal.enabled,
            name: cal.name,
          }
          await createMappingMutation.mutateAsync(payload)
        }
      } else if (tgt.cat === 'snapshot-trigger') {
        const payload: Partial<MIDICommand> = {
          name: cal.name,
          trigger_type: triggerType,
          channel,
          data1,
          data2_threshold: cal.threshold,
          action: tgt.action,
          target_chain_id: chainId,
          target_plugin_uri: null,
          action_params: null,
          is_enabled: cal.enabled,
        }
        await createCommandMutation.mutateAsync(payload)
      } else if (tgt.cat === 'routing-rule') {
        const payload: Partial<MIDIRoutingRule> = {
          chain_id: chainId ?? 0,
          name: cal.name,
          trigger_type: triggerType,
          channel,
          data1,
          from_flow_index: cal.fromFlow,
          to_flow_index: cal.toFlow,
          is_enabled: cal.enabled,
        }
        await createRoutingMutation.mutateAsync(payload)
      }

      if (mode === 'andNew') {
        setState((prev) => ({
          ...prev,
          source: null,
          target: null,
          calibration: null,
          activeControl: null,
        }))
        setStepIdx(1)
      } else {
        setState((prev) => ({
          ...prev,
          source: null,
          target: null,
          calibration: null,
          activeControl: null,
        }))
        setStepIdx(0)
      }
    } catch {
      // mutation errors surface via the mutation hooks; no console noise
    }
  }, [state.calibration, state.source, state.target, findActiveChainId, createMappingMutation, createCommandMutation, createRoutingMutation, createExpressionAssignmentMutation])

  // ─── Drawer ──────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ─── Keyboard shortcuts (Q10) ────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }
      const meta = e.metaKey || e.ctrlKey
      if (e.key === 'l' || e.key === 'L') {
        if (stepIdx === 1) setState((prev) => ({ ...prev, listening: !prev.listening }))
        e.preventDefault()
      } else if (e.key === 'ArrowLeft') {
        goPrev()
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        if (stepReady(stepIdx + 1)) goNext()
        e.preventDefault()
      } else if (meta && (e.key === 's' || e.key === 'S')) {
        if (stepIdx === 5) onSave('commit')
        e.preventDefault()
      } else if (meta && e.key === '.') {
        setDrawerOpen((v) => !v)
        e.preventDefault()
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1
        if (stepReady(idx)) setStepIdx(idx)
        e.preventDefault()
      } else if (e.key === '?') {
        setShowShortcuts((v) => !v)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepIdx, stepReady, goNext, goPrev, onSave])

  // ─── Test-step simulator value ──────────────────────────────────────────
  const [simulate, setSimulate] = useState<{ v: number }>({ v: 64 })

  // ─── Accent CSS variables (per-surface) ─────────────────────────────────
  const accent = state.surface?.meta?.color ?? pinnedSurface?.meta?.color ?? GENERIC_SURFACE_META.color
  const rootVars = useMemo(() => ({
    ['--mw-accent']: accent,
    ['--mw-accent-soft']: hexToRgba(accent, 0.18),
    ['--mw-accent-line']: hexToRgba(accent, 0.35),
  } as React.CSSProperties), [accent])

  const mappings = mappingsQuery.data?.mappings ?? []
  const plugins = pluginsQuery.data ?? []
  const engineParams = engineParamsQuery.data?.parameters ?? []

  const bindingPreview = useMemo(() => {
    if (!state.source) return <span style={{ color: 'var(--mw-text-4)' }}>build a binding…</span>
    return (
      <>
        <span className="accent">
          {state.source.kind === 'cc' && `CC ${state.source.cc}`}
          {state.source.kind === 'note' && `Note ${state.source.note}`}
          {state.source.kind === 'pc' && `PC ${state.source.pc}`}
        </span>
        {' '}ch {state.source.ch}
        <br />→ {state.target?.name ?? <span style={{ color: 'var(--mw-text-4)' }}>(no target yet)</span>}
      </>
    )
  }, [state.source, state.target])

  return (
    <div className="midi-walk" style={rootVars}>
      <div className="app">
        <div className="header">
          <span className="crumb"><b><Link to="/node-ops">MAP2</Link></b></span>
          <span className="sep">/</span>
          <span className="crumb"><Link to="/snapshot-editor">Snapshot Editor</Link></span>
          <span className="sep">/</span>
          <span className="crumb"><b>MIDI Assignments</b></span>
          <div className="grow" />
          {snapshotIdFromQuery && <span className="pill">snapshot · {snapshotIdFromQuery}</span>}
          <span className="pill live">engine · running</span>
          <span className="pill">{adaptedSurfaces.filter((s) => s.status === 'online').length} surface{adaptedSurfaces.filter((s) => s.status === 'online').length === 1 ? '' : 's'} online</span>
        </div>

        <div className="tabs">
          <button className="featured active">
            <span className="badge">v2</span>
            Walkthrough
          </button>
          <button onClick={() => setDrawerOpen(true)}>v1 · Advanced (legacy tabs)</button>
        </div>

        <div className="main">
          <div
            className="walk"
            style={{
              gridTemplateColumns: stripCollapsed ? '280px 1fr 48px' : '280px 1fr 360px',
            }}
          >
            <div className="stepper">
              <div className="eyebrow">Walkthrough</div>
              {STEPS.map((s, i) => {
                const cls = ['step']
                if (i === stepIdx) cls.push('active')
                if (stepDone(i)) cls.push('done')
                if (!stepReady(i)) cls.push('locked')
                return (
                  <div
                    key={s.id}
                    className={cls.join(' ')}
                    onClick={() => stepReady(i) && setStepIdx(i)}
                  >
                    <div className="num"><span>{String(i + 1).padStart(2, '0')}</span></div>
                    <div className="body">
                      <div className="title">{s.title}</div>
                      <div className="sub">{s.sub}</div>
                    </div>
                  </div>
                )
              })}
              <div className="divider" />
              <div className="meta">
                <div className="row"><span>surface</span><b>{state.surface?.shortLabel ?? '—'}</b></div>
                <div className="row"><span>pinned</span><b>{pinnedId === state.surface?.id ? '✓' : '·'}</b></div>
                <div className="row"><span>scope</span><b>{state.calibration?.scope ?? 'global'}</b></div>
                <div className="row"><span>mappings</span><b>{mappings.length}</b></div>
                <div className="row"><span>engine</span><b style={{ color: 'var(--mw-engine)' }}>● running</b></div>
              </div>
            </div>

            <div className="stage">
              <ErrorBoundary title="Walkthrough step crashed">
                {stepIdx === 0 && (
                  <StepDevice
                    surfaces={surfacesWithBenchPins}
                    state={state}
                    setState={updateState}
                    pinnedId={pinnedId}
                    onPin={setPinnedId}
                    onContinue={() => setStepIdx(1)}
                  />
                )}
                {stepIdx === 1 && <StepSource state={state} setState={updateState} />}
                {stepIdx === 2 && (
                  <StepTarget
                    state={state}
                    setState={updateState}
                    plugins={plugins}
                    engineParams={engineParams}
                    brainActions={brainActions}
                  />
                )}
                {stepIdx === 3 && (
                  <StepCalibrate
                    state={state}
                    setState={updateState}
                    midiSampleSinkRef={midiSampleSinkRef}
                  />
                )}
                {stepIdx === 4 && (
                  <StepTest
                    state={state}
                    simulate={simulate}
                    setSimulate={setSimulate}
                    onSendToEngine={onSendToEngine}
                    onFireTrigger={onFireTrigger}
                  />
                )}
                {stepIdx === 5 && (
                  <StepSave
                    state={state}
                    conflict={conflictMapping}
                    saving={saving}
                    onSave={onSave}
                  />
                )}
              </ErrorBoundary>

              <div className="actions">
                <button className="btn ghost" onClick={goPrev} disabled={stepIdx === 0}>← Back</button>
                <div className="grow">
                  <span className="helper">
                    {stepIdx === 0 && (state.surface ? `${state.surface.shortLabel} selected` : 'Pick a surface to continue')}
                    {stepIdx === 1 && (state.source ? 'Captured · ready for target' : 'Press Listen, or pick a CC manually')}
                    {stepIdx === 2 && (state.target ? `→ ${state.target.path}` : 'Pick a target parameter or command')}
                    {stepIdx === 3 && (state.calibration ? `${state.calibration.curve} · ${state.calibration.minOut}–${state.calibration.maxOut}` : 'Configure response')}
                    {stepIdx === 4 && 'Wiggle the source or scrub the simulator'}
                    {stepIdx === 5 && (saving ? 'Saving…' : conflictMapping ? '⚠ duplicate of an existing mapping' : 'Commit when ready')}
                  </span>
                </div>
                {stepIdx < STEPS.length - 1 && (
                  <button
                    className="btn"
                    onClick={goNext}
                    disabled={!stepDone(stepIdx) && stepIdx !== 4}
                  >
                    Next: {STEPS[stepIdx + 1].title} →
                  </button>
                )}
              </div>
            </div>

            <LiveMidiStrip
              listening={state.listening}
              onCapture={onCaptureListen}
              onSample={handleMidiSample}
              activeSurfaceLabel={state.surface?.shortLabel ?? null}
              sourceFilter={state.surface?.shortLabel ?? null}
              collapsed={stripCollapsed}
              onToggleCollapsed={() => setStripCollapsed((v) => !v)}
              bindingPreview={bindingPreview}
            />
          </div>
        </div>
      </div>

      <button className="drawer-handle" onClick={() => setDrawerOpen(true)}>
        <span className="dot" />
        Advanced · {mappings.length} active mappings
      </button>

      <AdvancedDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {showShortcuts && (
        <div className="shortcuts-overlay">
          <div className="hd">Shortcuts</div>
          <div><b>L</b> · listen for next message (Step 2)</div>
          <div><b>←/→</b> · prev/next step</div>
          <div><b>⌘S</b> · commit binding (Step 6)</div>
          <div><b>⌘.</b> · toggle advanced</div>
          <div><b>1-6</b> · jump to step</div>
          <div><b>?</b> · close this overlay</div>
        </div>
      )}
    </div>
  )
}

export default MidiAssignmentsPage
