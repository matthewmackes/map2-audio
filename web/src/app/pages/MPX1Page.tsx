import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Book, Branch, Categories, Music, Play, SettingsAdjust, Waveform } from '@carbon/icons-react'
import { Alert, Button, CircularProgress } from '@mui/material'

import { MPX1StatusBar } from '../components/MPX1/MPX1StatusBar'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import { formatMpx1ProgramName, formatMpx1ProgramNumber } from '../components/MPX1/programNumber'
import { useMPX1State, type MPX1RegistryParam, type UseMPX1StateResult } from '../../map2/mpx1Api'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useCluster } from '../contexts/useCluster'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import '../components/MPX1/MPX1PageShell.css'

type SidebarSectionId = 'panel' | 'editor' | 'midi-map' | 'matrix' | 'library' | 'perform' | 'diag' | 'flow'
type BypassBlock = 'REV' | 'PIT' | 'DLY' | 'CHO' | 'EQ' | 'MOD'

interface SidebarSection {
  id: SidebarSectionId
  to: string
  label: string
  color: string
  icon: React.ComponentType<any>
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: 'panel', to: '/mpx1/panel', label: 'Panel', color: '#38bdf8', icon: Categories },
  { id: 'editor', to: '/mpx1/editor', label: 'Editor', color: '#f59e0b', icon: SettingsAdjust },
  { id: 'midi-map', to: '/mpx1/midi-map', label: 'MIDI Mapper', color: '#ec4899', icon: Music },
  { id: 'matrix', to: '/mpx1/matrix', label: 'Mod Matrix', color: '#22c55e', icon: Waveform },
  { id: 'library', to: '/mpx1/library', label: 'Library', color: '#a78bfa', icon: Book },
  { id: 'perform', to: '/mpx1/perform', label: 'Perform', color: '#f97316', icon: Play },
  { id: 'diag', to: '/mpx1/diag', label: 'Diagnostics', color: '#14b8a6', icon: Activity },
  { id: 'flow', to: '/mpx1/flow', label: 'Signal Flow', color: '#818cf8', icon: Branch },
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

// This file intentionally exports a hook and page component together for route context.
// eslint-disable-next-line react-refresh/only-export-components
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
  const navigate = useNavigate()
  const activeSection = sectionFromPath(location.pathname)
  const { activeNodeId, localNodeId, nodes, setActiveNode } = useCluster()
  const { location: deviceLocation, isLoading: locationLoading } = useDeviceLocation('lexicon-mpx1')
  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const locationNode = deviceLocation ? nodes.find((node) => node.nodeId === deviceLocation.nodeId) : null
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null
  const needsSwitch = Boolean(deviceLocation && selectedNodeId !== deviceLocation.nodeId)
  const locationOffline = Boolean(locationNode && locationNode.nodeId !== localNodeId && !locationNode.isOnline)
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

  const navigationItems = useMemo<UnifiedWorkspaceSideNavItem[]>(
    () => SIDEBAR_SECTIONS.map((section) => ({
      key: section.id,
      label: section.label,
      description: `MPX1 ${section.label.toLowerCase()} workspace for the current program, routing, and performance state.`,
      to: section.to,
      icon: section.icon,
      active: activeSection === section.id,
      onOpen: () => navigate(section.to),
      meta: activeSection === section.id ? 'Current' : undefined,
    })),
    [activeSection, navigate],
  )

  const renderShell = (content: React.ReactNode) => (
    <>
      <ShellWindowTitleStrip />
      <div className="mpx1-shell">
        {content}
      </div>
    </>
  )

  if (locationLoading) {
    return renderShell(
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <LoadingState description="Checking cluster MIDI inventory for the Lexicon MPX-1" />
      </div>
    )
  }

  if (!deviceLocation) {
    return renderShell(
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <EmptyState
          title="No Lexicon MPX-1 MIDI interface is currently detected on any cluster node"
          description="Connect the interface or switch to the node where it is attached to manage it here."
          align="left"
        />
      </div>
    )
  }

  if (needsSwitch) {
    const locationLabel = deviceLocation.hostname ?? deviceLocation.nodeId
    return renderShell(
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setActiveNode(deviceLocation.nodeId === localNodeId ? null : deviceLocation.nodeId)}
            >
              Switch to {locationLabel}
            </Button>
          }
        >
          Lexicon MPX-1 is connected to {locationLabel}. Select that node to manage the rack.
        </Alert>
      </div>
    )
  }

  if (locationOffline) {
    return renderShell(
      <div className="mpx1-shell__main" style={{ padding: 24 }}>
        <Alert severity="warning">
          Lexicon MPX-1 is assigned to {deviceLocation.hostname ?? deviceLocation.nodeId}, but that peer is currently offline.
        </Alert>
      </div>
    )
  }

  return (
    <MPX1PageContext.Provider value={contextValue}>
      {renderShell(
        <>
          <UnifiedWorkspaceSideNav
            ariaLabel="MPX1 section navigation"
            className="mpx1-shell__sidebar"
            eyebrow="Rack editor"
            title="Lexicon MPX-1"
            description="One tree for front-panel control, deep editing, MIDI mapping, libraries, performance, diagnostics, and signal flow."
            items={navigationItems}
            metaBlocks={[
              { key: 'mpx1-node', label: 'Node', value: selectedNode?.hostname ?? selectedNodeId },
              { key: 'mpx1-program', label: 'Program', value: `${formatMpx1ProgramNumber(currentProgram)} ${currentProgramName}` },
              { key: 'mpx1-link', label: 'Connection', value: mpx1.state?.connected ? 'Online' : 'Offline' },
            ]}
            callout={{
              kind: remoteSelected ? 'warning' : 'info',
              text: remoteSelected
                ? `Control is proxied to ${selectedNode?.hostname ?? selectedNodeId}.`
                : 'Direct local control path is active for the MPX-1 rack.',
            }}
            storageKey="mpx1-rack"
          />

          <div className="mpx1-shell__main">
            {remoteSelected ? (
              <div style={{ padding: '12px 16px 0 16px' }}>
                <Alert severity="info">
                  MPX-1 control is proxied to {selectedNode?.hostname ?? selectedNodeId}.
                </Alert>
              </div>
            ) : null}
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
        </>
      )}
    </MPX1PageContext.Provider>
  )
}
