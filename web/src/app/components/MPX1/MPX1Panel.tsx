import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { MPX1RegistryParam } from '../../../map2/mpx1Api'
import { useMPX1PageContext } from '../../pages/MPX1Page'
import { MPX1Knob } from './MPX1Knob'
import { formatMpx1ProgramNumber } from './programNumber'
import './MPX1Panel.css'

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface EffectBlock {
  slotId: string
  paramId: string
  label: string
  shortId: string
}

const EFFECT_BLOCKS: EffectBlock[] = [
  { slotId: 'pitch',  paramId: 'program.pitch.algorithm',  label: 'PITCH',  shortId: 'P' },
  { slotId: 'chorus', paramId: 'program.chorus.algorithm', label: 'CHORUS', shortId: 'C' },
  { slotId: 'eq',     paramId: 'program.eq.algorithm',     label: 'EQ',     shortId: 'E' },
  { slotId: 'mod',    paramId: 'program.mod.algorithm',    label: 'MOD',    shortId: 'M' },
  { slotId: 'delay',  paramId: 'program.delay.algorithm',  label: 'DELAY',  shortId: 'D' },
  { slotId: 'reverb', paramId: 'program.reverb.algorithm', label: 'REVERB', shortId: 'R' },
]

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function findParam(
  params: MPX1RegistryParam[] | undefined,
  paramId: string,
): MPX1RegistryParam | null {
  return params?.find((p) => p.id === paramId) ?? null
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export function MPX1Panel() {
  const { mpx1, setLcdText } = useMPX1PageContext()

  const containerRef = useRef<HTMLDivElement | null>(null)

  const [selectedBlock, setSelectedBlock] = useState<EffectBlock | null>(null)
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })

  const params = mpx1.registry?.params ?? []
  const shadow = mpx1.shadow

  /* ── Derived state ────────────────────────────────────────────────────── */

  const bypassedSlots = useMemo(
    () =>
      new Set(
        Object.entries(shadow)
          .filter(([id, val]) => id.endsWith('.bypass') && val >= 0.5)
          .map(([id]) => id.replace('.bypass', '').split('.').pop() ?? ''),
      ),
    [shadow],
  )

  const panelState = !mpx1.state?.connected
    ? 'offline'
    : bypassedSlots.size > 0
      ? 'bypassed'
      : 'active'

  const ledSync   = Boolean(mpx1.state?.connected)
  const ledMidi   = mpx1.lastEvent?.type === 'mpx1:midi_cc'
  const ledEdit   = Boolean(selectedBlock)
  const ledBypass = panelState === 'bypassed'

  const programNumber = formatMpx1ProgramNumber(mpx1.state?.current_program ?? 0)
  const rawProgramName = (mpx1.state as { program_name?: unknown } | null | undefined)?.program_name
  const programName   = mpx1.state?.connected
    ? (typeof rawProgramName === 'string' ? rawProgramName : '')
    : ''

  const displayLine1 = programName.slice(0, 16)
  const displayLine2 = programName.length > 16 ? programName.slice(16, 32) : ''

  /* ── Selected param (popover) ─────────────────────────────────────────── */

  const selectedParam = useMemo(
    () => (selectedBlock ? findParam(params, selectedBlock.paramId) : null),
    [params, selectedBlock],
  )

  const selectedValue = useMemo(() => {
    if (!selectedParam) return 0
    const v = shadow[selectedParam.id]
    if (Number.isFinite(v)) return Number(v)
    return Number(selectedParam.default ?? selectedParam.range?.min ?? 0)
  }, [shadow, selectedParam])

  /* ── LCD text sync ────────────────────────────────────────────────────── */

  const lastEventText = useMemo(() => {
    const ev = mpx1.lastEvent
    if (!ev) return 'No SysEx activity yet'
    const ts =
      typeof ev.timestamp === 'number'
        ? new Date(ev.timestamp * 1000).toLocaleTimeString()
        : new Date().toLocaleTimeString()
    const d = ev.data as Record<string, unknown> | undefined
    const pid = typeof d?.param_id === 'string' ? d.param_id : ''
    const val = Number(d?.value)
    if (pid)
      return `${ev.type} • ${pid} = ${Number.isFinite(val) ? val.toFixed(2) : '-'} • ${ts}`
    return `${ev.type} • ${ts}`
  }, [mpx1.lastEvent])

  /* ── Popover display text ─────────────────────────────────────────────── */

  const valueDisplayText = useMemo(() => {
    if (selectedParam) {
      const name = selectedParam.display_name ?? selectedBlock?.label ?? ''
      return `${name.slice(0, 10)}: ${selectedValue.toFixed(2)}`
    }
    return `P${programNumber}  ${mpx1.state?.connected ? 'ONLINE' : '--'}`
  }, [selectedParam, selectedBlock, selectedValue, programNumber, mpx1.state?.connected])

  /* ── Handlers ─────────────────────────────────────────────────────────── */

  const handleBlockClick = (block: EffectBlock, e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    setPopoverPos({
      x: clamp(e.clientX - bounds.left + 12, 20, bounds.width - 220),
      y: clamp(e.clientY - bounds.top + 8,   20, bounds.height - 240),
    })
    setSelectedBlock(block)
    setLcdText(`EDIT  ${block.label}`)
  }

  const handleValueChange = (value: number) => {
    if (!selectedParam) return
    void mpx1.setParam(selectedParam.id, value).catch((err) => {
      console.error('[MPX1Panel] setParam failed:', err)
    })
  }

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <div className={`mpx1-panel-view mpx1-panel-view--${panelState}`}>

      {/* ── Rack shell ─────────────────────────────────────────────────── */}
      <div className="mpx1-rack-shell" ref={containerRef}>

        {/* Rack ears */}
        <div className="mpx1-rack-ear mpx1-rack-ear--left" aria-hidden="true">
          <div className="mpx1-rack-ear__hole" />
          <div className="mpx1-rack-ear__hole" />
          <div className="mpx1-rack-ear__hole" />
        </div>
        <div className="mpx1-rack-ear mpx1-rack-ear--right" aria-hidden="true">
          <div className="mpx1-rack-ear__hole" />
          <div className="mpx1-rack-ear__hole" />
          <div className="mpx1-rack-ear__hole" />
        </div>

        {/* ── Face plate ─────────────────────────────────────────────── */}
        <div className="mpx1-face" role="region" aria-label="Lexicon MPX-1 front panel">

          {/* ── Input / Output knobs ──────────────────────────────────── */}
          <div className="mpx1-section--io">
            <div className="mpx1-io-knob-group">
              <div className="mpx1-io-knob-label">Input</div>
              <div
                className="mpx1-hw-knob mpx1-hw-knob--lg"
                role="slider"
                aria-label="Input level"
                aria-valuenow={75}
                aria-valuemin={0}
                aria-valuemax={100}
                title="Input Level"
              />
            </div>
            <div className="mpx1-io-knob-group">
              <div className="mpx1-io-knob-label">Output</div>
              <div
                className="mpx1-hw-knob mpx1-hw-knob--lg"
                role="slider"
                aria-label="Output level"
                aria-valuenow={75}
                aria-valuemin={0}
                aria-valuemax={100}
                title="Output Level"
              />
            </div>
          </div>

          {/* ── Display section ───────────────────────────────────────── */}
          <div className="mpx1-section--display">
            <div className="mpx1-display-brand">
              <span className="mpx1-display-brand__name">MPX 1</span>
              <span className="mpx1-display-brand__sub">Multiple Processor FX</span>
            </div>

            <div className="mpx1-display-bezel" aria-live="polite" aria-label="Program display">
              <div className="mpx1-display__number">{programNumber}</div>
              <div className="mpx1-display__name">
                {displayLine1 || (mpx1.state?.connected ? '\u00a0' : 'NO DEVICE')}
                {displayLine2 && (
                  <>
                    <br />
                    {displayLine2}
                  </>
                )}
              </div>
            </div>

            {/* LED indicators */}
            <div className="mpx1-led-row">
              <div className="mpx1-led-group">
                <div
                  className={`mpx1-led ${ledSync ? 'mpx1-led--on' : ''}`}
                  title="Sync"
                />
                <span className="mpx1-led-label">SYNC</span>
              </div>
              <div className="mpx1-led-group">
                <div
                  className={`mpx1-led mpx1-led--amber ${ledMidi ? 'mpx1-led--on' : ''}`}
                  title="MIDI activity"
                />
                <span className="mpx1-led-label">MIDI</span>
              </div>
              <div className="mpx1-led-group">
                <div
                  className={`mpx1-led ${ledEdit ? 'mpx1-led--on' : ''}`}
                  title="Edit mode"
                />
                <span className="mpx1-led-label">EDIT</span>
              </div>
              <div className="mpx1-led-group">
                <div
                  className={`mpx1-led mpx1-led--amber ${ledBypass ? 'mpx1-led--on' : ''}`}
                  title="Bypass active"
                />
                <span className="mpx1-led-label">BYP</span>
              </div>
            </div>
          </div>

          {/* ── Effect block buttons ──────────────────────────────────── */}
          <div className="mpx1-section--blocks">
            <div className="mpx1-blocks-label">Effect Blocks</div>
            <div className="mpx1-blocks-row">
              {EFFECT_BLOCKS.map((block) => {
                const isBypassed = bypassedSlots.has(block.slotId)
                const isSelected = selectedBlock?.slotId === block.slotId
                return (
                  <button
                    key={block.slotId}
                    type="button"
                    className={[
                      'mpx1-block-btn',
                      isSelected  ? 'mpx1-block-btn--selected'  : '',
                      isBypassed  ? 'mpx1-block-btn--bypassed'  : '',
                    ].join(' ').trim()}
                    onClick={(e) => handleBlockClick(block, e)}
                    aria-pressed={isSelected}
                    aria-label={`${block.label} effect block${isBypassed ? ' (bypassed)' : ''}`}
                    title={`${block.label} – click to edit`}
                  >
                    <div className="mpx1-block-btn__bypass" aria-hidden="true" />
                    <div className="mpx1-block-btn__led"    aria-hidden="true" />
                    <span className="mpx1-block-btn__name">{block.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Function buttons (All, A/B, Tap) ─────────────────────── */}
          <div className="mpx1-section--fn">
            <div className="mpx1-fn-row">
              <button type="button" className="mpx1-fn-btn" title="Compare A/B">
                <span className="mpx1-fn-btn__label">A/B</span>
              </button>
              <button type="button" className="mpx1-fn-btn" title="All bypasses">
                <span className="mpx1-fn-btn__label">ALL</span>
              </button>
            </div>
            <div className="mpx1-fn-row">
              <button type="button" className="mpx1-fn-btn" title="Tap tempo">
                <span className="mpx1-fn-btn__label">TAP</span>
              </button>
              <button type="button" className="mpx1-fn-btn" title="System settings">
                <span className="mpx1-fn-btn__label">SYS</span>
              </button>
            </div>
          </div>

          {/* ── Value encoder ─────────────────────────────────────────── */}
          <div className="mpx1-section--value">
            <div className="mpx1-value-display" aria-live="polite">
              <div className="mpx1-value-display__text">{valueDisplayText}</div>
            </div>
            <div
              className="mpx1-hw-knob"
              role="slider"
              aria-label="Value encoder"
              aria-valuenow={selectedValue}
              aria-valuemin={0}
              aria-valuemax={127}
              title="Value"
            />
            <div className="mpx1-io-knob-label" style={{ fontSize: 7 }}>VALUE</div>
            <button type="button" className="mpx1-fn-btn" title="Edit / Enter">
              <span className="mpx1-fn-btn__label">EDIT</span>
            </button>
          </div>

          {/* ── Navigation (< >) + Power ──────────────────────────────── */}
          <div className="mpx1-section--nav">
            <div className="mpx1-nav-row">
              <button
                type="button"
                className="mpx1-nav-btn"
                aria-label="Previous program"
                title="Previous program"
              >
                ‹
              </button>
              <button
                type="button"
                className="mpx1-nav-btn"
                aria-label="Next program"
                title="Next program"
              >
                ›
              </button>
            </div>
            <div className="mpx1-logo-row">
              <span className="mpx1-logo">lexicon</span>
              <div
                className={`mpx1-power-led ${mpx1.state?.connected ? 'mpx1-power-led--on' : ''}`}
                title={mpx1.state?.connected ? 'Device connected' : 'Device offline'}
                aria-label={mpx1.state?.connected ? 'Power on' : 'Power off'}
              />
            </div>
          </div>

        </div>{/* /face */}

        {/* ── State overlays ──────────────────────────────────────────── */}
        {panelState === 'offline' && (
          <div className="mpx1-panel-overlay mpx1-panel-overlay--offline">NO DEVICE</div>
        )}
        {panelState === 'bypassed' && (
          <div className="mpx1-panel-overlay mpx1-panel-overlay--bypassed">BYPASS ACTIVE</div>
        )}

        {/* ── Parameter popover ───────────────────────────────────────── */}
        {selectedBlock && selectedParam && (
          <div
            className="mpx1-panel-popover"
            style={{ left: popoverPos.x, top: popoverPos.y }}
            role="dialog"
            aria-label={`Edit ${selectedParam.display_name}`}
          >
            <div className="mpx1-panel-popover__title">
              {selectedParam.display_name}
            </div>
            <MPX1Knob
              label={selectedParam.units || 'value'}
              value={selectedValue}
              min={Number(selectedParam.range?.min ?? 0)}
              max={Number(selectedParam.range?.max ?? 127)}
              step={Math.max(
                0.01,
                (Number(selectedParam.range?.max ?? 127) -
                  Number(selectedParam.range?.min ?? 0)) /
                  200,
              )}
              onChange={handleValueChange}
            />
            <button
              type="button"
              className="mpx1-panel-popover__close"
              onClick={() => {
                setSelectedBlock(null)
                setLcdText('')
              }}
            >
              Close
            </button>
          </div>
        )}

      </div>{/* /rack-shell */}

      {/* ── Activity log ────────────────────────────────────────────────── */}
      <div className="mpx1-panel-activity" aria-live="polite">
        {lastEventText}
      </div>

    </div>
  )
}
