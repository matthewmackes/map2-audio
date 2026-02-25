import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { MPX1RegistryParam } from '../../../map2/mpx1Api'
import { useMPX1PageContext } from '../../pages/MPX1Page'
import { MPX1Knob } from './MPX1Knob'
import './MPX1Panel.css'

interface PanelControlSlot {
  slotId: string
  x: number
  y: number
  paramId: string
  fallbackLabel: string
}

const PANEL_SLOTS: PanelControlSlot[] = [
  { slotId: 'pitch', x: 110, y: 176, paramId: 'program.pitch.algorithm', fallbackLabel: 'Pitch Alg' },
  { slotId: 'chorus', x: 226, y: 176, paramId: 'program.chorus.algorithm', fallbackLabel: 'Chorus Alg' },
  { slotId: 'eq', x: 342, y: 176, paramId: 'program.eq.algorithm', fallbackLabel: 'EQ Alg' },
  { slotId: 'mod', x: 458, y: 176, paramId: 'program.mod.algorithm', fallbackLabel: 'Mod Alg' },
  { slotId: 'reverb', x: 574, y: 176, paramId: 'program.reverb.algorithm', fallbackLabel: 'Reverb Alg' },
  { slotId: 'delay', x: 690, y: 176, paramId: 'program.delay.algorithm', fallbackLabel: 'Delay Alg' },
]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function findParam(params: MPX1RegistryParam[] | undefined, paramId: string): MPX1RegistryParam | null {
  if (!params) return null
  return params.find((param) => param.id === paramId) ?? null
}

export function MPX1Panel() {
  const { mpx1, setLcdText } = useMPX1PageContext()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const lcdTextRef = useRef<SVGTextElement | null>(null)

  const [selectedSlot, setSelectedSlot] = useState<PanelControlSlot | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })

  const params = mpx1.registry?.params ?? []

  const activeBypassCount = useMemo(
    () => Object.entries(mpx1.shadow).filter(([id, value]) => id.endsWith('.bypass') && value >= 0.5).length,
    [mpx1.shadow]
  )

  const panelState = !mpx1.state?.connected
    ? 'offline'
    : activeBypassCount > 0
      ? 'bypassed'
      : 'active'

  const lastEventText = useMemo(() => {
    const event = mpx1.lastEvent
    if (!event) {
      return 'No SysEx activity yet'
    }
    const timestamp = typeof event.timestamp === 'number'
      ? new Date(event.timestamp * 1000).toLocaleTimeString()
      : new Date().toLocaleTimeString()
    const data = event.data as Record<string, unknown> | undefined
    const paramId = typeof data?.param_id === 'string' ? data.param_id : ''
    const value = Number(data?.value)
    if (paramId) {
      return `${event.type} • ${paramId} = ${Number.isFinite(value) ? value.toFixed(2) : '-'} • ${timestamp}`
    }
    return `${event.type} • ${timestamp}`
  }, [mpx1.lastEvent])

  const selectedParam = useMemo(() => {
    if (!selectedSlot) return null
    return findParam(params, selectedSlot.paramId)
  }, [params, selectedSlot])

  const selectedValue = useMemo(() => {
    if (!selectedParam) return 0
    const shadowValue = mpx1.shadow[selectedParam.id]
    if (Number.isFinite(shadowValue)) return Number(shadowValue)
    return Number(selectedParam.default ?? selectedParam.range?.min ?? 0)
  }, [mpx1.shadow, selectedParam])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const ledStates: Record<string, boolean> = {
      'led-sync': Boolean(mpx1.state?.connected),
      'led-midi': mpx1.lastEvent?.type === 'mpx1:midi_cc',
      'led-edit': Boolean(selectedSlot),
      'led-bypass': panelState === 'bypassed',
    }

    Object.entries(ledStates).forEach(([ledId, active]) => {
      const led = svg.querySelector<SVGCircleElement>(`[data-mpx1-led='${ledId}']`)
      if (!led) return
      led.setAttribute('fill', active ? '#34d399' : '#334155')
      led.style.filter = active ? 'drop-shadow(0 0 5px rgba(52, 211, 153, 0.8))' : 'none'
    })

    if (lcdTextRef.current) {
      const text = selectedParam
        ? `${selectedParam.display_name}: ${selectedValue.toFixed(2)}`
        : `P${(mpx1.state?.current_program ?? 0).toString().padStart(3, '0')}  ${mpx1.state?.connected ? 'ONLINE' : 'NO DEVICE'}`
      lcdTextRef.current.textContent = text.slice(0, 42)
    }
  }, [mpx1.lastEvent?.type, mpx1.state?.connected, mpx1.state?.current_program, panelState, selectedParam, selectedSlot, selectedValue])

  const handleControlClick = (slot: PanelControlSlot, event: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return
    const bounds = container.getBoundingClientRect()
    setPopoverPosition({
      x: clamp(event.clientX - bounds.left + 10, 20, bounds.width - 220),
      y: clamp(event.clientY - bounds.top - 10, 20, bounds.height - 220),
    })
    setSelectedSlot(slot)
    setLcdText(`EDIT • ${slot.fallbackLabel}`)
  }

  const updateSelectedValue = (value: number) => {
    if (!selectedParam) return
    void mpx1.setParam(selectedParam.id, value).catch((err) => {
      console.error('Failed to update MPX1 panel control:', err)
    })
  }

  return (
    <div className={`mpx1-panel-view mpx1-panel-view--${panelState}`}>
      <div className="mpx1-panel-wrapper" ref={containerRef}>
        <svg
          ref={svgRef}
          className="mpx1-panel-svg"
          viewBox="0 0 820 340"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="MPX1 front panel"
        >
          <defs>
            <linearGradient id="panelFace" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f2937" />
              <stop offset="100%" stopColor="#111827" />
            </linearGradient>
          </defs>

          <rect x="6" y="10" width="808" height="320" rx="16" fill="url(#panelFace)" stroke="#475569" strokeWidth="2" />
          <rect x="32" y="34" width="260" height="82" rx="8" fill="#111827" stroke="#334155" />
          <rect x="40" y="44" width="244" height="62" rx="5" fill="#1f2937" stroke="#0f172a" />
          <text ref={lcdTextRef} x="52" y="80" fill="#fbbf24" fontSize="16" fontFamily="'Space Grotesk', sans-serif">MPX1 ONLINE</text>

          <circle cx="325" cy="66" r="8" data-mpx1-led="led-sync" />
          <circle cx="352" cy="66" r="8" data-mpx1-led="led-midi" />
          <circle cx="379" cy="66" r="8" data-mpx1-led="led-edit" />
          <circle cx="406" cy="66" r="8" data-mpx1-led="led-bypass" />

          <text x="316" y="98" fill="#94a3b8" fontSize="10">SYNC  MIDI  EDIT  BYP</text>

          {PANEL_SLOTS.map((slot) => {
            const param = findParam(params, slot.paramId)
            const label = param?.panel_control || param?.display_name || slot.fallbackLabel
            return (
              <g key={slot.slotId}>
                <circle cx={slot.x} cy={slot.y} r="34" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
                <circle cx={slot.x} cy={slot.y - 18} r="4" fill="#cbd5e1" />
                <text x={slot.x} y={slot.y + 50} textAnchor="middle" fill="#cbd5e1" fontSize="10">{label}</text>
                <circle
                  cx={slot.x}
                  cy={slot.y}
                  r="42"
                  fill="transparent"
                  stroke="transparent"
                  data-mpx1-control={slot.paramId}
                  className="mpx1-panel-hit"
                  onClick={(event) => handleControlClick(slot, event)}
                />
              </g>
            )
          })}

          <rect x="30" y="286" width="760" height="26" rx="6" fill="#0f172a" stroke="#334155" />
          <text x="44" y="304" fill="#64748b" fontSize="10">LEXICON MPX1 • MAP2 WEB PANEL</text>
        </svg>

        {panelState === 'offline' && <div className="mpx1-panel-overlay mpx1-panel-overlay--offline">NO DEVICE</div>}
        {panelState === 'bypassed' && panelState !== 'offline' && <div className="mpx1-panel-overlay mpx1-panel-overlay--bypassed">BYPASS ACTIVE</div>}

        {selectedSlot && selectedParam && (
          <div
            className="mpx1-panel-popover"
            style={{ left: popoverPosition.x, top: popoverPosition.y }}
          >
            <div className="mpx1-panel-popover__title">{selectedParam.display_name}</div>
            <MPX1Knob
              label={selectedParam.units || 'value'}
              value={selectedValue}
              min={Number(selectedParam.range?.min ?? 0)}
              max={Number(selectedParam.range?.max ?? 127)}
              step={Math.max(0.01, (Number(selectedParam.range?.max ?? 127) - Number(selectedParam.range?.min ?? 0)) / 200)}
              onChange={updateSelectedValue}
            />
            <button type="button" onClick={() => setSelectedSlot(null)}>Close</button>
          </div>
        )}
      </div>

      <div className="mpx1-panel-activity">{lastEventText}</div>
    </div>
  )
}
