import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { MPX1StatusBar } from './MPX1StatusBar'
import { formatMpx1ProgramName, formatMpx1ProgramNumber } from './programNumber'
import { useMPX1State, type MPX1RegistryParam, type UseMPX1StateResult } from '../../../../map2/mpx1Api'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import { useCluster } from '../../../contexts/useCluster'
import { useDeviceNodeContext } from '../../../hooks/useDeviceNodeContext'
import { useActiveSectionFromPath } from '../hooks/useActiveSectionFromPath'
import { MidiServicesCrossLinkBanner } from '../../../pages/midi-services/MidiServicesCrossLinkBanner'
import './MPX1PageShell.css'

type SidebarSectionId = 'panel' | 'editor' | 'midi-map' | 'matrix' | 'library' | 'perform' | 'diag' | 'flow'
type BypassBlock = 'REV' | 'PIT' | 'DLY' | 'CHO' | 'EQ' | 'MOD'

const SIDEBAR_SECTION_IDS: SidebarSectionId[] = [
  'panel',
  'editor',
  'midi-map',
  'matrix',
  'library',
  'perform',
  'diag',
  'flow',
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
  nodeId: string | null
  activeSection: SidebarSectionId
  currentProgramName: string
  lcdText: string
  setLcdText: (text: string) => void
}

const MPX1PageContext = createContext<MPX1PageContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useMPX1PageContext(): MPX1PageContextValue {
  const context = useContext(MPX1PageContext)
  if (!context) {
    throw new Error('useMPX1PageContext must be used within MPX1Shell context provider')
  }
  return context
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function findParamByCandidates(params: MPX1RegistryParam[] | undefined, candidates: string[]): MPX1RegistryParam | null {
  if (!params || params.length === 0) return null
  for (const candidate of candidates) {
    const found = params.find((param) => param.id === candidate)
    if (found) return found
  }
  return null
}

export interface MPX1ShellProps {
  /**
   * T2485-4 — route prefix the shell is mounted at. Defaults to the
   * legacy /devices/mpx1/ path; the unified /midi/devices/lexicon-mpx1/
   * mount passes its own prefix so useActiveSectionFromPath resolves
   * the active sidebar section correctly under the new URL.
   */
  routePrefix?: string
}

export function MPX1Shell({ routePrefix = '/devices/mpx1/' }: MPX1ShellProps = {}) {
  const activeSection = useActiveSectionFromPath(routePrefix, SIDEBAR_SECTION_IDS, 'panel')
  const { activeNodeId, localNodeId } = useCluster()
  const { deviceState } = useDeviceNodeContext('lexicon-mpx1')
  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null
  const mpx1 = useMPX1State({
    nodeId: apiNodeId,
    autoConnectWs: !apiNodeId,
    pollIntervalMs: apiNodeId ? 5000 : 0,
  })

  const [lcdText, setLcdText] = useState('MPX1 READY')
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [bypassState, setBypassState] = useState(DEFAULT_BYPASS_STATE)

  const currentProgram = mpx1.state?.current_program ?? 0
  const currentProgramEntry = mpx1.programs.find((program) => program.program === currentProgram)
  const currentProgramName = formatMpx1ProgramName(currentProgram, currentProgramEntry?.name)

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
    setLcdText(`PROGRAM ${formatMpx1ProgramNumber(currentProgram)} • ${currentProgramName} • ${connectivity}`)
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
    nodeId: apiNodeId,
    activeSection,
    currentProgramName,
    lcdText,
    setLcdText,
  }), [activeSection, apiNodeId, currentProgramName, lcdText, mpx1])

  if (deviceState === 'loading') {
    return (
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <LoadingState description="Checking cluster MIDI inventory for the Lexicon MPX-1" />
      </div>
    )
  }

  if (deviceState === 'not_found') {
    return (
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <EmptyState
          title="No Lexicon MPX-1 MIDI interface is currently detected on any cluster node"
          description="Connect the interface or switch to the node where it is attached to manage it here."
          align="left"
        />
      </div>
    )
  }

  return (
    <MPX1PageContext.Provider value={contextValue}>
      <div className="mpx1-shell mpx1-shell--embedded">
        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <MidiServicesCrossLinkBanner profileKey="lexicon/mpx-1.midi" />
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
