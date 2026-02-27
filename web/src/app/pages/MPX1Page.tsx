import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Books, MusicNotes, Pulse, Sliders, SquaresFour, Waveform, Play } from '@phosphor-icons/react'

import { MPX1StatusBar } from '../components/MPX1/MPX1StatusBar'
import { useMPX1State, type MPX1RegistryParam, type UseMPX1StateResult } from '../../map2/mpx1Api'
import '../components/MPX1/MPX1PageShell.css'

type SidebarSectionId = 'panel' | 'editor' | 'midi-map' | 'matrix' | 'library' | 'perform' | 'diag'
type BypassBlock = 'REV' | 'PIT' | 'DLY' | 'CHO' | 'EQ' | 'MOD'

interface SidebarSection {
  id: SidebarSectionId
  to: string
  label: string
  color: string
  icon: React.ComponentType<any>
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: 'panel', to: '/mpx1/panel', label: 'Panel', color: '#38bdf8', icon: SquaresFour },
  { id: 'editor', to: '/mpx1/editor', label: 'Editor', color: '#f59e0b', icon: Sliders },
  { id: 'midi-map', to: '/mpx1/midi-map', label: 'MIDI Mapper', color: '#ec4899', icon: MusicNotes },
  { id: 'matrix', to: '/mpx1/matrix', label: 'Mod Matrix', color: '#22c55e', icon: Waveform },
  { id: 'library', to: '/mpx1/library', label: 'Library', color: '#a78bfa', icon: Books },
  { id: 'perform', to: '/mpx1/perform', label: 'Perform', color: '#f97316', icon: Play },
  { id: 'diag', to: '/mpx1/diag', label: 'Diagnostics', color: '#14b8a6', icon: Pulse },
]

const DEFAULT_BYPASS_STATE: Record<BypassBlock, boolean> = {
  REV: true,
  PIT: true,
  DLY: true,
  CHO: true,
  EQ: true,
  MOD: true,
}

export interface MPX1PageContextValue {
  mpx1: UseMPX1StateResult
  activeSection: SidebarSectionId
  currentProgramName: string
  lcdText: string
  setLcdText: (text: string) => void
}

const MPX1PageContext = createContext<MPX1PageContextValue | null>(null)

export function useMPX1PageContext(): MPX1PageContextValue {
  const context = useContext(MPX1PageContext)
  if (!context) {
    throw new Error('useMPX1PageContext must be used within MPX1Page context provider')
  }
  return context
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sectionFromPath(pathname: string): SidebarSectionId {
  for (const section of SIDEBAR_SECTIONS) {
    if (pathname === section.to || pathname.startsWith(`${section.to}/`)) {
      return section.id
    }
  }
  return 'panel'
}

function findParamByCandidates(params: MPX1RegistryParam[] | undefined, candidates: string[]): MPX1RegistryParam | null {
  if (!params || params.length === 0) return null
  for (const candidate of candidates) {
    const found = params.find((param) => param.id === candidate)
    if (found) return found
  }
  return null
}

export function MPX1Page() {
  const location = useLocation()
  const activeSection = sectionFromPath(location.pathname)
  const mpx1 = useMPX1State()

  const [lcdText, setLcdText] = useState('MPX1 READY')
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [bypassState, setBypassState] = useState(DEFAULT_BYPASS_STATE)

  const currentProgram = mpx1.state?.current_program ?? 0
  const currentProgramEntry = mpx1.programs.find((program) => program.program === currentProgram)
  const currentProgramName = currentProgramEntry?.name ?? `Program ${Math.max(0, currentProgram).toString().padStart(3, '0')}`

  const maxProgramSlots = Math.max(1, mpx1.registry?.program_management?.program_slots ?? 250)

  const mixParam = useMemo(
    () =>
      findParamByCandidates(mpx1.registry?.params, [
        'program.master_mix',
        'program.mix',
        'program.output.mix',
      ]),
    [mpx1.registry?.params]
  )

  const mixMin = mixParam?.range?.min ?? 0
  const mixMax = mixParam?.range?.max ?? 127
  const mixRaw = mixParam ? Number(mpx1.shadow[mixParam.id] ?? mixParam.default ?? mixMin) : mixMin
  const mixValue = clamp01((mixRaw - mixMin) / Math.max(1, mixMax - mixMin))

  useEffect(() => {
    const connectivity = mpx1.state?.connected ? 'ONLINE' : 'OFFLINE'
    setLcdText(`PROGRAM ${currentProgram.toString().padStart(3, '0')} • ${currentProgramName} • ${connectivity}`)
  }, [currentProgram, currentProgramName, mpx1.state?.connected])

  const handleProgramStep = useCallback((delta: number) => {
    const nextProgram = Math.min(maxProgramSlots - 1, Math.max(0, currentProgram + delta))
    void mpx1.setProgram(nextProgram).catch((err) => {
      console.error('Failed to set MPX1 program:', err)
    })
  }, [currentProgram, maxProgramSlots, mpx1])

  const handleMixChange = useCallback((nextValue: number) => {
    if (!mixParam) {
      return
    }

    const scaled = mixMin + clamp01(nextValue) * (mixMax - mixMin)
    void mpx1.setParam(mixParam.id, scaled).catch((err) => {
      console.error('Failed to set MPX1 mix parameter:', err)
    })
  }, [mixMax, mixMin, mixParam, mpx1])

  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    setTapTimes((prev) => {
      const next = [...prev, now].slice(-6)
      if (next.length < 2) {
        return next
      }

      const intervals: number[] = []
      for (let index = 1; index < next.length; index += 1) {
        const delta = next[index] - next[index - 1]
        if (delta > 120 && delta < 2200) {
          intervals.push(delta)
        }
      }
      if (intervals.length === 0) {
        return next
      }

      const averageMs = intervals.reduce((acc, value) => acc + value, 0) / intervals.length
      const bpm = Math.max(30, Math.min(300, 60000 / averageMs))
      setTapTempoBpm(bpm)
      setLcdText(`TAP TEMPO • ${Math.round(bpm)} BPM`)
      return next
    })
  }, [])

  const handleToggleBypass = useCallback((block: BypassBlock) => {
    setBypassState((prev) => {
      const next = { ...prev, [block]: !prev[block] }
      const stateLabel = next[block] ? 'ENGAGED' : 'BYPASSED'
      setLcdText(`${block} ${stateLabel}`)
      return next
    })
  }, [])

  const contextValue = useMemo<MPX1PageContextValue>(() => ({
    mpx1,
    activeSection,
    currentProgramName,
    lcdText,
    setLcdText,
  }), [activeSection, currentProgramName, lcdText, mpx1])

  return (
    <MPX1PageContext.Provider value={contextValue}>
      <div className="mpx1-shell">
        <aside className="mpx1-shell__sidebar" aria-label="MPX1 section navigation">
          {SIDEBAR_SECTIONS.map((section) => {
            const SectionIcon = section.icon
            return (
              <NavLink
                key={section.id}
                to={section.to}
                title={section.label}
                aria-label={section.label}
                className={({ isActive }) => `mpx1-shell__sidebar-btn${isActive ? ' is-active' : ''}`}
                style={{ '--section-accent': section.color } as React.CSSProperties}
              >
                <SectionIcon size={18} weight="duotone" aria-hidden />
              </NavLink>
            )
          })}
        </aside>

        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <Outlet />
          </div>

          <MPX1StatusBar
            connected={Boolean(mpx1.state?.connected)}
            deviceName="MPX1 Rack"
            programNumber={currentProgram}
            programName={currentProgramName}
            lcdText={lcdText}
            mixValue={mixValue}
            tapTempoBpm={tapTempoBpm}
            bypassState={bypassState}
            onProgramStep={handleProgramStep}
            onMixChange={handleMixChange}
            onTapTempo={handleTapTempo}
            onToggleBypass={handleToggleBypass}
          />
        </div>
      </div>
    </MPX1PageContext.Provider>
  )
}
